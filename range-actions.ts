import type { ExtensionDialogs } from "hunkdiff/extension";
import { pendingRange, requestCommit, requestRange, type SessionDeps } from "./session.ts";
import { selectedRange, seriesSnapshot } from "./store.ts";

export interface RangeDraft {
  start: string | null;
  end: string | null;
}

export interface RangeActionsContext {
  dialogs: Pick<ExtensionDialogs, "select">;
  notify(message: string, type?: "info" | "warning" | "error"): void;
}

/** Hunk owns modal focus, Escape, theme and cancellation on review reload. */
export async function showRangeActions(
  sha: string,
  draft: RangeDraft,
  ctx: RangeActionsContext,
  session?: SessionDeps,
): Promise<void> {
  const snapshot = seriesSnapshot();
  const commit = snapshot.commits.find((entry) => entry.sha === sha);
  if (!commit) return;
  const start = snapshot.commits.findIndex((entry) => entry.sha === draft.start);
  const end = snapshot.commits.findIndex((entry) => entry.sha === draft.end);
  const options = ["Start here", "End here"];
  if (start >= 0 && end >= 0) options.push(`Apply ${Math.min(start, end) + 1}–${Math.max(start, end) + 1}`);
  if (draft.start !== null || draft.end !== null || snapshot.range !== null || pendingRange() !== null)
    options.push("Clear range");
  options.push("Show scope");
  const endpoints = [
    start >= 0 ? `start ${snapshot.commits[start]!.abbrev}` : "",
    end >= 0 ? `end ${snapshot.commits[end]!.abbrev}` : "",
  ].filter(Boolean).join(" · ");
  const title = endpoints ? `${commit.abbrev} · ${endpoints}` : commit.abbrev;
  const action = await ctx.dialogs.select({ title, options });
  // An answer to an older review must not target a newly loaded series.
  if (action === null || seriesSnapshot() !== snapshot) return;
  if (action === "Start here") {
    draft.start = sha;
  } else if (action === "End here") {
    draft.end = sha;
  } else if (action.startsWith("Apply ")) {
    if (start === end) requestCommit(snapshot.commits[start]!.sha, ctx.notify, session);
    else {
      const range = selectedRange(snapshot, start, end);
      if (range) requestRange(range, ctx.notify, session);
    }
  } else if (action === "Clear range") {
    draft.start = null;
    draft.end = null;
    const current = snapshot.position === null ? undefined : snapshot.commits[snapshot.position];
    if ((snapshot.range !== null || pendingRange() !== null) && current)
      requestCommit(current.sha, ctx.notify, session);
  } else if (action === "Show scope") {
    ctx.notify(snapshot.scope ?? "Opened commit", "info");
  }
}
