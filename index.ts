import type { ExtensionPaneControls, HunkExtensionAPI } from "hunkdiff/extension";
import { CommitLogPane, MessagePane } from "./pane.tsx";
import {
  configuredLimit,
  configuredMessageRows,
  configuredRange,
  gitRunner,
  readMessage,
  resolveSeries,
  seriesTitle,
  type SeriesOptions,
} from "./series.ts";
import { pendingCommit, requestCommit } from "./session.ts";
import {
  COLLAPSED_MESSAGE_PANE,
  EMPTY_SERIES,
  EXPANDED_RUNGS,
  expandedPane,
  messagePanes,
  neighbour,
  publishSeries,
  seriesSnapshot,
} from "./store.ts";

export default function registerCommitLog(hunk: HunkExtensionAPI): void {
  const options: SeriesOptions = {
    range: configuredRange(hunk.config),
    limit: configuredLimit(hunk.config),
  };

  hunk.transformChangeset((changeset, ctx) => {
    // A throwing transform costs the reviewer the whole changeset, so every
    // failure here degrades to the review Hunk built without us.
    try {
      const git = gitRunner(ctx.cwd);
      const review = resolveSeries(
        changeset.title,
        git,
        options,
        (message) => hunk.log(message),
        seriesSnapshot().commits,
      );
      if (review === null) {
        publishSeries(EMPTY_SERIES);
        return changeset;
      }

      const head = review.commits[review.position];
      publishSeries({
        commits: review.commits,
        position: review.position,
        message: head === undefined ? null : readMessage(git, head.sha),
      });
      return { ...changeset, title: seriesTitle(review) };
    } catch (error) {
      publishSeries(EMPTY_SERIES);
      hunk.log(`failed to resolve the commit series: ${String(error)}`);
      return changeset;
    }
  });

  hunk.registerPane({
    id: "commits",
    title: "Commits",
    placement: "left",
    width: { preferred: 36, min: 24 },
    defaultOpen: true,
    // Hunk drops a left pane that would squeeze the diff below its minimum, so
    // the review keeps its width on a narrow terminal and loses this column.
    available: () => seriesSnapshot().position !== null,
    component: CommitLogPane,
  });

  const hasMessage = () => seriesSnapshot().message !== null;

  hunk.registerPane({
    id: COLLAPSED_MESSAGE_PANE,
    title: "Commit message",
    placement: "top",
    // No `max`: Hunk caps a drag at the pane's own maximum, so declaring one
    // stops a reviewer growing the pane to fit a long body. Hunk still keeps
    // five rows for the diff, which is the only ceiling that belongs here.
    height: { preferred: configuredMessageRows(hunk.config), min: 3 },
    defaultOpen: true,
    available: hasMessage,
    component: MessagePane,
  });

  // One pane per rung of the ladder: the expand key opens whichever one holds
  // this commit's message. Hunk still clamps a rung to the rows left after the
  // review keeps its five, so a message longer than the screen fills it and
  // reports the remainder.
  for (const rows of EXPANDED_RUNGS) {
    hunk.registerPane({
      id: expandedPane(rows),
      title: `Commit message, ${rows} rows`,
      placement: "top",
      height: { preferred: rows, min: 3 },
      available: hasMessage,
      component: MessagePane,
    });
  }

  hunk.registerCommand({ id: "toggle", title: "Toggle the commit list", key: "h" }, (ctx) => {
    ctx.panes.toggle("commits");
  });

  let expanded = false;

  /** Show the message at one size, closing every pane that held the other. */
  const showMessageAt = (ctx: { panes: ExtensionPaneControls }, next: boolean): void => {
    const panes = messagePanes(seriesSnapshot().message);
    for (const rows of EXPANDED_RUNGS) {
      if (!next || expandedPane(rows) !== panes.expanded) {
        ctx.panes.close(expandedPane(rows));
      }
    }
    if (next) {
      ctx.panes.close(panes.collapsed);
      ctx.panes.open(panes.expanded);
    } else {
      ctx.panes.open(panes.collapsed);
    }
    expanded = next;
  };

  hunk.registerCommand({ id: "message", title: "Toggle the commit message", key: "i" }, (ctx) => {
    const panes = messagePanes(seriesSnapshot().message);
    ctx.panes.toggle(expanded ? panes.expanded : panes.collapsed);
  });

  hunk.registerCommand(
    { id: "expand", title: "Expand or collapse the commit message", key: "I" },
    (ctx) => {
      if (hasMessage()) {
        showMessageAt(ctx, !expanded);
      }
    },
  );

  // A step to another commit brings a message of another length, so the rung
  // that fit the last one is the wrong pane to leave open.
  hunk.on("changeset_loaded", (_event, ctx) => {
    if (expanded && hasMessage()) {
      showMessageAt(ctx, true);
    }
  });

  // `]` and `[` are already next and previous hunk, and a built-in keeps a
  // chord an extension asks for, so stepping between commits gets n and p.
  for (const step of [
    { id: "next", title: "Next commit in the series", key: "n", delta: 1, edge: "newest" },
    { id: "previous", title: "Previous commit in the series", key: "p", delta: -1, edge: "oldest" },
  ] as const) {
    hunk.registerCommand({ id: step.id, title: step.title, key: step.key }, (ctx) => {
      const snapshot = seriesSnapshot();
      if (snapshot.position === null) {
        return;
      }

      const target = neighbour(snapshot, step.delta, pendingCommit());
      if (target === null) {
        ctx.notify(`already at the ${step.edge} commit in the series`, "info");
        return;
      }

      requestCommit(target.sha, ctx.notify);
    });
  }

  // Hunk shows the side-pane area on its own only in a full-width viewport
  // (220 columns), and filters every left and right pane out below that.
  // Opening the pane reveals the area, which `defaultOpen` alone does not do,
  // so the commit list is there at the width a terminal usually has.
  hunk.on("startup", (_event, ctx) => {
    ctx.panes.open("commits");
  });
}
