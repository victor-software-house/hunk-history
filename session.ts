import { execFile } from "node:child_process";

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

/**
 * Replace this window's review with one commit.
 *
 * The extension API can navigate inside a loaded changeset but cannot load a
 * different one, so the way to move between commits is the session daemon that
 * every window already registers with. Resolves what went wrong, or null when
 * the window followed.
 */
export async function loadCommit(sha: string, deps: SessionDeps): Promise<string | null> {
  const id = await sessionId(deps);
  if (id === null) {
    return "cannot find this Hunk window in the session daemon";
  }

  const result = await deps.run(["session", "reload", id, "--", "show", sha]);
  return result === null ? `cannot load ${sha.slice(0, 8)}` : null;
}

let inFlight: string | null = null;
let queued: string | null = null;

/**
 * The commit this window is on its way to, if it is on its way anywhere.
 *
 * Stepping has to count from here rather than from what is loaded: a reload
 * takes long enough that a reviewer pressing "previous" three times does it
 * before the first one lands, and counting from the loaded commit would make
 * all three ask for the same neighbour.
 */
export function pendingCommit(): string | null {
  return queued ?? inFlight;
}

/** Forget any request in progress; only tests need this. */
export function resetPending(): void {
  inFlight = null;
  queued = null;
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
  if (inFlight !== null) {
    queued = sha === inFlight ? null : sha;
    return;
  }

  inFlight = sha;
  void loadCommit(sha, deps).then((problem) => {
    inFlight = null;
    if (problem !== null) {
      report(problem, "warning");
    }

    const next = queued;
    queued = null;
    if (next !== null && next !== sha) {
      requestCommit(next, report, deps);
    }
  });
}
