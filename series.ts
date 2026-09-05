import { execFile } from "node:child_process";
import type { CommitMessage, SeriesCommit, SeriesSnapshot } from "./store.ts";

export type GitRunner = (args: readonly string[]) => Promise<string | null>;
export interface SeriesOptions { range: string | null; limit: number }
export const DEFAULT_LIMIT = 50;
export const DEFAULT_MESSAGE_ROWS = 3;

/** Async, bounded subprocesses never hold the terminal's rendering thread. */
export function gitRunner(cwd: string): GitRunner {
  return (args) => new Promise((resolve) => {
    const child = execFile("git", [...args], {
      cwd, encoding: "utf8", timeout: 5_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    }, (error, stdout) => resolve(error ? null : stdout.trimEnd()));
    child.stdin?.end();
  });
}

export function configuredRange(config: unknown): string | null {
  const value = (config as { range?: unknown } | undefined)?.range;
  if (typeof value !== "string") return null;
  const range = value.trim();
  return range && !range.startsWith("-") ? range : null;
}

export function configuredLimit(config: unknown): number {
  const value = (config as { limit?: unknown } | undefined)?.limit;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(500, Math.max(1, Math.trunc(value))) : DEFAULT_LIMIT;
}

export function configuredMessageRows(config: unknown): number {
  const value = (config as { messageRows?: unknown } | undefined)?.messageRows;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(60, Math.max(3, Math.trunc(value))) : DEFAULT_MESSAGE_ROWS;
}

/** One metadata query per page, newest first; no per-row Git processes. */
export async function readPage(git: GitRunner, ref: string | readonly string[], limit: number, skip = 0): Promise<SeriesCommit[] | null> {
  const revisions = typeof ref === "string" ? [ref] : ref;
  if (revisions.length === 0 || revisions.some((value) => !value || value.startsWith("-"))) return null;
  const text = await git(["log", "--no-show-signature", "--no-decorate", "--no-color", `--max-count=${limit}`, `--skip=${skip}`, "--format=%H%x00%h%x00%s%x00%P", ...revisions, "--"]);
  if (text === null) return null;
  if (!text) return [];
  let emptyTree: string | null = null;
  const commits: SeriesCommit[] = [];
  for (const line of text.split("\n")) {
    const [sha, abbrev, subject, parents = ""] = line.split("\0");
    if (!sha || !abbrev || subject === undefined) return null;
    const parent = parents.split(" ")[0];
    if (!parent && !emptyTree) emptyTree = await git(["hash-object", "-t", "tree", "--stdin"]);
    commits.push({ sha, abbrev, subject, baseSha: parent || emptyTree });
  }
  return commits;
}

export async function readMessage(git: GitRunner, ref: string): Promise<CommitMessage | null> {
  if (!ref || ref.startsWith("-")) return null;
  const text = await git(["log", "-1", "--no-show-signature", "--no-decorate", "--no-color", "--format=%an%x00%aI%x00%b", ref, "--"]);
  if (text === null) return null;
  const [author, timestamp, body = ""] = text.split("\0");
  return author !== undefined && timestamp !== undefined ? { author, timestamp, body: body.trim() } : null;
}

/** Porcelain -z keeps renamed paths and unusual filenames out of the counter grammar. */
export async function readWorktree(git: GitRunner): Promise<{ staged: number; unstaged: number } | null> {
  const text = await git(["status", "--porcelain=v1", "-z", "--untracked-files=normal"]);
  if (text === null) return null;
  let staged = 0;
  let unstaged = 0;
  const entries = text.split("\0");
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const x = entry[0], y = entry[1];
    if (x === "?" && y === "?") { unstaged++; continue; }
    if (x !== " " && x !== "!") staged++;
    if (y !== " " && y !== "!") unstaged++;
    if (x === "R" || x === "C" || y === "R" || y === "C") i++;
  }
  return { staged, unstaged };
}

export function seriesTitle(repoName: string, snapshot: SeriesSnapshot): string {
  const head = snapshot.commit ?? snapshot.commits[snapshot.position ?? -1];
  return head ? `${repoName} ${head.abbrev} ${head.subject}` : repoName;
}

export function rangeTitle(repoName: string, snapshot: SeriesSnapshot): string {
  const range = snapshot.range;
  if (!range) return repoName;
  return `${repoName} ${snapshot.commits[range.start]?.abbrev}…${snapshot.commits[range.end]?.abbrev}`;
}
