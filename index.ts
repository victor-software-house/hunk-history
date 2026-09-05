import type { ExtensionCommandContext, ExtensionPaneControls, HunkExtensionAPI } from "hunkdiff/extension";
import { CommitLogPane, MessagePane } from "./pane.tsx";
import { configuredLimit, configuredMessageRows, configuredRange, gitRunner, readMessage, readPage, rangeTitle, seriesTitle } from "./series.ts";
import { loadingReview, pendingCommit, requestCommit, requestWorking, requestComparison } from "./session.ts";
import { HistoryController, historySnapshot, cancelHistoryGesture } from "./history.ts";
import {
  COLLAPSED_MESSAGE_PANE,
  EXPANDED_RUNGS,
  expandedPane,
  messagePanes,
  neighbour,
  publishSeries,
  remapRange,
  seriesSnapshot,
} from "./store.ts";
import { createElement } from "react";
import { showSidebar, toggleFiles } from "./sidebar.ts";
import { historyInstructions } from "./cli.ts";

export default function registerCommitLog(hunk: HunkExtensionAPI): void {
  hunk.registerCliCommand({ name: "history", summary: "Read history extension instructions", usage: "<instructions|help>" }, historyInstructions);
  hunk.events.on("hunk-history:files", (_event, ctx) => {
    cancelHistoryGesture();
    showSidebar(ctx.panes, "files");
  });
  const configured = configuredRange(hunk.config);
  const history = new HistoryController({ range: configured, limit: configuredLimit(hunk.config) });

  hunk.transformChangeset(async (changeset, ctx) => {
    try {
      if (!await history.connect(ctx.cwd)) return changeset;
      const repo = history.repoName;
      const title = changeset.title;
      const request = loadingReview();
      const own = request && (request.kind === "commit" ? title === `${repo} show ${request.value}`
        : request.kind === "range" ? title === `${repo} ${request.value}`
        : title === `${repo} ${request.value === "staged" ? "staged changes" : request.value === "all" ? "HEAD" : "working tree"}`);
      const old = seriesSnapshot();
      if (!own && old.review !== title) cancelHistoryGesture();
      const git = gitRunner(ctx.cwd);
      if (title.startsWith(`${repo} show `)) {
        const ref = title.slice(`${repo} show `.length);
        const commit = (await readPage(git, ref, 1))?.[0];
        if (!commit) return changeset;
        const message = await readMessage(git, commit.sha);
        const snapshot = seriesSnapshot();
        const position = snapshot.commits.findIndex((row) => row.sha === commit.sha);
        publishSeries({ ...snapshot, review: title, commit, position: position < 0 ? null : position, range: null, message });
        return { ...changeset, title: seriesTitle(repo, seriesSnapshot()) };
      }
      const snapshot = seriesSnapshot();
      const requestedRange = own && request?.kind === "range" ? request.selection : null;
      const heldRange = title === snapshot.review ? snapshot.range : null;
      const range = requestedRange ?? heldRange;
      const selection = range ? remapRange(snapshot, range) : null;
      publishSeries({ ...snapshot, review: title, commit: null, position: selection?.endpoint ?? null, range: selection, message: null });
      return selection ? { ...changeset, title: rangeTitle(repo, seriesSnapshot()) } : changeset;
    } catch (error) {
      hunk.log(`failed to resolve history: ${String(error)}`);
      return changeset;
    }
  });

  const chooseScope = async (ctx: ExtensionCommandContext) => {
    const snapshot = seriesSnapshot();
    const labels = ["Current branch (live)", ...(configured ? [`Configured: ${configured}`] : []),
      ...(snapshot.commit ? ["History through selected commit (pinned)"] : [])];
    const choice = await ctx.dialogs.select({ title: "History scope", options: labels });
    if (choice === null) return;
    await history.scope(choice === labels[0] ? "HEAD" : choice.startsWith("Configured:") ? configured! : snapshot.commit!.sha);
  };

  hunk.registerPane({
    id: "commits",
    title: "Commits",
    placement: "left",
    width: { preferred: 34, min: 22 },
    defaultOpen: false,
    // Hunk drops a left pane that would squeeze the diff below its minimum, so
    // the review keeps its width on a narrow terminal and loses this column.
    available: () => historySnapshot().root !== null,
    component: (props) => createElement(CommitLogPane, {
      ...props,
      onFiles: () => hunk.events.emit("hunk-history:files", null),
      onMore: () => { void history.refresh(true); },
    }),
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

  hunk.registerCommand({ id: "toggle", title: "Switch Files / Commits", key: "h" }, (ctx) => {
    if (historySnapshot().root === null) {
      ctx.notify("History requires a Git repository", "info");
      return;
    }
    cancelHistoryGesture();
    showSidebar(ctx.panes, ctx.panes.isOpen("commits") ? "files" : "commits");
  });

  hunk.registerCommand({ id: "files", title: "Toggle Files exclusively" }, (ctx) => {
    cancelHistoryGesture();
    toggleFiles(ctx.panes);
  });

  hunk.registerCommand({ id: "scope", title: "Choose history scope" }, chooseScope);
  hunk.registerCommand({ id: "refresh", title: "Refresh commit history" }, async () => { await history.refresh(); });
  hunk.registerCommand({ id: "older", title: "Load older commits" }, async () => { await history.refresh(true); });
  for (const value of ["staged", "unstaged", "all"] as const) {
    hunk.registerCommand({ id: value, title: `Review ${value === "all" ? "all uncommitted changes" : value + " changes"}` }, (ctx) => {
      cancelHistoryGesture();
      requestWorking(value, ctx.notify);
    });
  }
  for (const through of ["HEAD", "worktree"] as const) {
    hunk.registerCommand({ id: `through-${through.toLowerCase()}`, title: `Review from selection through ${through === "HEAD" ? "HEAD (live)" : "working tree (live)"}` }, (ctx) => {
      const snapshot = seriesSnapshot();
      const base = snapshot.range ? snapshot.range.revisionRange.split("..")[0] : snapshot.commit?.baseSha;
      if (!base) { ctx.notify("Select a commit or range first", "info"); return; }
      cancelHistoryGesture();
      requestComparison(base, through, ctx.notify);
    });
  }

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
    if (ctx.panes.isOpen("commits")) {
      showSidebar(ctx.panes, historySnapshot().root === null ? "files" : "commits");
    }
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
    hunk.registerCommand({ id: step.id, title: step.title, key: step.key }, async (ctx) => {
      const snapshot = seriesSnapshot();
      if (snapshot.position === null) {
        return;
      }

      let target = neighbour(snapshot, step.delta, pendingCommit());
      if (target === null && step.delta === -1 && historySnapshot().hasMore) {
        await history.refresh(true);
        target = neighbour(seriesSnapshot(), step.delta, pendingCommit());
      }
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
    if (historySnapshot().root !== null) showSidebar(ctx.panes, "commits");
    history.start();
  });
  hunk.on("session_reload", () => { void history.refresh(); });
  hunk.on("shutdown", () => history.stop());
}
