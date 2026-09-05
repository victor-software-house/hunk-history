import { execFile } from "node:child_process";
import type { SeriesRange } from "./store.ts";

/** One command run against the Hunk CLI: trimmed stdout, or null on failure. */
export type CommandRunner = (args: readonly string[]) => Promise<string | null>;

/** How long the daemon gets to answer before a click is abandoned. */
const COMMAND_TIMEOUT_MS = 4_000;

/**
 * Run the Hunk binary that is running this extension.
 *
 * `process.execPath` rather than a PATH lookup: the child has to speak the
 * same session protocol as the window it is steering, and it is the same
 * process image, so it does by construction.
 */
export function hunkRunner(): CommandRunner {
  return (args) =>
    new Promise((resolve) => {
      execFile(
        process.execPath,
        [...args],
        { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
        (error, stdout) => {
          resolve(error === null ? stdout.trim() : null);
        },
      );
    });
}

/**
 * This window's session id, out of everything the daemon has registered.
 *
 * Every Hunk TUI registers with its own pid, and an extension runs inside that
 * process, so `process.pid` names this window exactly. `hunk session reload
 * --repo <path>` would settle for any window open on the same checkout, which
 * is the wrong window as soon as two are.
 */
export function findSessionId(listing: string, pid: number): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(listing);
  } catch {
    return null;
  }

  const sessions = (parsed as { sessions?: unknown }).sessions;
  if (!Array.isArray(sessions)) {
    return null;
  }

  for (const session of sessions) {
    const record = session as { pid?: unknown; sessionId?: unknown };
    if (record.pid === pid && typeof record.sessionId === "string" && record.sessionId !== "") {
      return record.sessionId;
    }
  }

  return null;
}

/** Everything `loadCommit` needs from outside itself. */
export interface SessionDeps {
  run: CommandRunner;
  pid: number;
}

let cachedSessionId: string | null = null;

async function sessionId(deps: SessionDeps): Promise<string | null> {
  if (cachedSessionId !== null) {
    return cachedSessionId;
  }

  const listing = await deps.run(["session", "list", "--json"]);
  cachedSessionId = listing === null ? null : findSessionId(listing, deps.pid);
  return cachedSessionId;
}

/** Forget the resolved session id; only tests need this. */
export function resetSessionId(): void {
  cachedSessionId = null;
}

/** One review the extension can ask the live Hunk window to load. */
type ReviewTarget =
  | { kind: "commit"; value: string }
  | { kind: "working"; value: "staged" | "unstaged" | "all" }
  | { kind: "range"; value: string; selection: SeriesRange | null; live?: boolean };

/** Replace this window's review with one target. */
async function loadReview(target: ReviewTarget, deps: SessionDeps): Promise<string | null> {
  const id = await sessionId(deps);
  if (id === null) {
    return "cannot find this Hunk window in the session daemon";
  }

  const command = target.kind === "commit" ? "show" : "diff";
  const args = target.kind === "working"
    ? target.value === "staged" ? ["--staged", "--watch"]
      : target.value === "all" ? ["HEAD", "--watch"] : ["--watch"]
    : target.kind === "range" && target.live
      ? [target.value, "--watch"] : [target.value];
  const result = await deps.run(["session", "reload", id, "--", command, ...args]);
  if (result === null) cachedSessionId = null;
  const label = target.kind === "commit" ? target.value.slice(0, 8)
    : target.kind === "working" ? `${target.value} changes` : "the selected range";
  return result === null ? `cannot load ${label}` : null;
}

/** Replace this window's review with one commit. */
export function loadCommit(sha: string, deps: SessionDeps): Promise<string | null> {
  return loadReview({ kind: "commit", value: sha }, deps);
}

/** Replace this window's review with one concrete tree range. */
export function loadRange(range: string, deps: SessionDeps): Promise<string | null> {
  return loadReview({ kind: "range", value: range, selection: null }, deps);
}

let inFlight: ReviewTarget | null = null;
let queued: ReviewTarget | null = null;
const pendingListeners = new Set<() => void>();

/** Latest requested review, distinct from the successfully loaded series. */
export function pendingReview(): ReviewTarget | null {
  return queued ?? inFlight;
}

/** The transform must match the request being loaded, not a newer queued click. */
export function loadingReview(): ReviewTarget | null { return inFlight; }

export function requestWorking(
  value: "staged" | "unstaged" | "all",
  report: (message: string, type?: "info" | "warning" | "error") => void,
  deps: SessionDeps = { run: hunkRunner(), pid: process.pid },
): void {
  requestReview({ kind: "working", value }, report, deps);
}

export function requestComparison(
  base: string,
  through: "HEAD" | "worktree",
  report: (message: string, type?: "info" | "warning" | "error") => void,
  deps: SessionDeps = { run: hunkRunner(), pid: process.pid },
): void {
  requestReview({ kind: "range", value: through === "HEAD" ? `${base}..HEAD` : base, selection: null, live: true }, report, deps);
}

export function subscribePending(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => { pendingListeners.delete(listener); };
}

function notifyPending(): void {
  for (const listener of pendingListeners) listener();
}

/** Only the matching changeset transform may commit this selection to the pane. */
export function pendingRange(): SeriesRange | null {
  return inFlight?.kind === "range" ? inFlight.selection : null;
}

/** Report whether two requests name the same review. */
function sameTarget(left: ReviewTarget, right: ReviewTarget): boolean {
  return left.kind === right.kind && left.value === right.value;
}

/**
 * The commit this window is on its way to, if it is on its way anywhere.
 *
 * Stepping has to count from here rather than from what is loaded: a reload
 * takes long enough that a reviewer pressing "previous" three times does it
 * before the first one lands, and counting from the loaded commit would make
 * all three ask for the same neighbour.
 */
export function pendingCommit(): string | null {
  const target = queued ?? inFlight;
  return target?.kind === "commit" ? target.value : null;
}

/** Forget any request in progress; only tests need this. */
export function resetPending(): void {
  inFlight = null;
  queued = null;
  notifyPending();
}

/**
 * Ask this window to show one commit.
 *
 * A click or a keypress is not a promise the caller can await: the handler
 * returns at once and the review arrives when the daemon has rebuilt it. One
 * reload runs at a time, because two in flight land in an order nothing
 * guarantees; further requests coalesce, so a burst of steps loads the commit
 * the reviewer stopped on rather than every commit they passed through.
 */
export function requestCommit(
  sha: string,
  report: (message: string, type?: "info" | "warning" | "error") => void,
  deps: SessionDeps = { run: hunkRunner(), pid: process.pid },
): void {
  requestReview({ kind: "commit", value: sha }, report, deps);
}

/** Ask this window to show one concrete inclusive range. */
export function requestRange(
  selection: SeriesRange,
  report: (message: string, type?: "info" | "warning" | "error") => void,
  deps: SessionDeps = { run: hunkRunner(), pid: process.pid },
): void {
  requestReview({ kind: "range", value: selection.revisionRange, selection }, report, deps);
}

/** Serialize reloads and coalesce bursts to the last review the user requested. */
function requestReview(
  target: ReviewTarget,
  report: (message: string, type?: "info" | "warning" | "error") => void,
  deps: SessionDeps,
): void {
  if (inFlight !== null) {
    queued = sameTarget(target, inFlight) ? null : target;
    notifyPending();
    return;
  }

  inFlight = target;
  notifyPending();
  void loadReview(target, deps).then((problem) => {
    inFlight = null;
    if (problem !== null) {
      report(problem, "warning");
    }

    const next = queued;
    queued = null;
    if (next !== null && !sameTarget(next, target)) {
      requestReview(next, report, deps);
    } else {
      notifyPending();
    }
  });
}
