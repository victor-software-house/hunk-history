import type { HunkExtensionAPI } from "hunkdiff/extension";
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
  EXPANDED_MESSAGE_PANE,
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

  // Hunk clamps a pane to the space left after the review keeps its five rows,
  // so asking for more rows than any terminal has means "as much as fits".
  hunk.registerPane({
    id: EXPANDED_MESSAGE_PANE,
    title: "Commit message, expanded",
    placement: "top",
    height: { preferred: 200, min: 3 },
    available: hasMessage,
    component: MessagePane,
  });

  hunk.registerCommand({ id: "toggle", title: "Toggle the commit list", key: "h" }, (ctx) => {
    ctx.panes.toggle("commits");
  });

  let expanded = false;

  hunk.registerCommand({ id: "message", title: "Toggle the commit message", key: "i" }, (ctx) => {
    ctx.panes.toggle(messagePanes(expanded).open);
  });

  hunk.registerCommand(
    { id: "expand", title: "Expand or collapse the commit message", key: "I" },
    (ctx) => {
      if (!hasMessage()) {
        return;
      }

      expanded = !expanded;
      const panes = messagePanes(expanded);
      ctx.panes.close(panes.close);
      ctx.panes.open(panes.open);
    },
  );

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
