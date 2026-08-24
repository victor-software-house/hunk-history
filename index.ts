import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import type { HunkExtensionAPI } from "hunkdiff/extension";

/**
 * One commit in the series behind the current review.
 *
 * Ordered oldest first everywhere in this extension, the way a patch series
 * reads, so the position shown in the header and the direction the stepping
 * keys will move agree with each other.
 */
export interface SeriesCommit {
  sha: string;
  abbrev: string;
  subject: string;
}

/** The reviewed commit, and the series it belongs to. */
export interface ReviewSeries {
  repoName: string;
  commits: SeriesCommit[];
  /** Index of the reviewed commit in `commits`. */
  position: number;
}

/** Which commits to gather when the review does not name a range itself. */
export interface SeriesOptions {
  range: string | null;
  limit: number;
}

/** One git invocation: trimmed stdout, or null for any failure. */
export type GitRunner = (args: readonly string[]) => string | null;

/** Commits with no configured range: the N ending at the reviewed commit. */
export const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;
const GIT_TIMEOUT_MS = 2_000;

let series: SeriesCommit[] = [];
let position: number | null = null;

/** The series behind the review Hunk currently shows, oldest first. */
export function currentSeries(): readonly SeriesCommit[] {
  return series;
}

/** Where the reviewed commit sits in that series, or null outside a revision show. */
export function currentPosition(): number | null {
  return position;
}

/**
 * Run git in one working directory.
 *
 * Both streams are captured rather than inherited: the renderer owns the
 * terminal, so a single line of git progress on stderr would corrupt the frame.
 */
export function gitRunner(cwd: string): GitRunner {
  return (args) => {
    try {
      return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        timeout: GIT_TIMEOUT_MS,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 8 * 1024 * 1024,
      }).trim();
    } catch {
      return null;
    }
  };
}

/** Read one commit, or null when the rev names nothing. */
function readCommit(git: GitRunner, rev: string): SeriesCommit | null {
  const line = git(["log", "-1", "--no-patch", "--format=%H%x00%h%x00%s", rev, "--"]);
  if (line === null) {
    return null;
  }

  const [sha, abbrev, subject] = line.split("\0");
  if (sha === undefined || abbrev === undefined || subject === undefined) {
    return null;
  }

  return { sha, abbrev, subject };
}

/** Read every commit a revision list names, oldest first. */
function readCommits(git: GitRunner, shas: string): SeriesCommit[] {
  return shas === ""
    ? []
    : shas.split("\n").flatMap((sha) => {
        const commit = readCommit(git, sha);
        return commit === null ? [] : [commit];
      });
}

/**
 * A range from configuration, or null when there is none to trust.
 *
 * Repository config can set `[extension.hunk-commit-log]`, so this string is
 * untrusted input that ends up in a git argument list. No shell is involved,
 * which leaves one way to misread it: a leading dash would make git treat the
 * value as an option rather than a range.
 */
export function configuredRange(config: unknown): string | null {
  const value = (config as { range?: unknown } | undefined)?.range;
  if (typeof value !== "string") {
    return null;
  }

  const range = value.trim();
  return range === "" || range.startsWith("-") ? null : range;
}

/** A commit count from configuration, clamped to something a sidebar can hold. */
export function configuredLimit(config: unknown): number {
  const value = (config as { limit?: unknown } | undefined)?.limit;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIMIT);
}

/**
 * The series the reviewed commit belongs to, oldest first.
 *
 * A configured range that does not contain the reviewed commit is the reviewer
 * looking outside the branch they configured, not an error: fall back to the
 * commits leading up to what they actually opened.
 */
function buildSeries(
  git: GitRunner,
  head: SeriesCommit,
  options: SeriesOptions,
  log: (message: string) => void,
): SeriesCommit[] {
  if (options.range !== null) {
    const configured = readCommits(git, git(["rev-list", "--reverse", options.range, "--"]) ?? "");
    if (configured.some((commit) => commit.sha === head.sha)) {
      return configured;
    }
    log(
      `range "${options.range}" does not contain ${head.abbrev}; ` +
        `using the ${options.limit} commits before it`,
    );
  }

  const recent = git(["rev-list", "-n", String(options.limit), head.sha, "--"]);
  const commits = readCommits(git, (recent ?? "").split("\n").reverse().join("\n"));
  return commits.length === 0 ? [head] : commits;
}

/**
 * The series behind one review title, or null when the review is not one commit.
 *
 * Hunk's git backend titles a `show` review `<repo-name> show <ref>` and titles
 * a working-tree, stash, or patch review something else, so the title is what
 * says whether a commit series is even the right frame for what is on screen.
 * Nothing in the extension API reports the reviewed ref directly.
 */
export function resolveSeries(
  title: string,
  git: GitRunner,
  options: SeriesOptions,
  log: (message: string) => void,
): ReviewSeries | null {
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  if (repoRoot === null) {
    return null;
  }

  const repoName = basename(repoRoot);
  const prefix = `${repoName} show `;
  if (!title.startsWith(prefix)) {
    return null;
  }

  const ref = title.slice(prefix.length);
  const head = readCommit(git, ref);
  if (head === null) {
    log(`cannot read a commit for ref "${ref}"`);
    return null;
  }

  const commits = buildSeries(git, head, options, log);
  const found = commits.findIndex((commit) => commit.sha === head.sha);
  return found < 0
    ? { repoName, commits: [head], position: 0 }
    : { repoName, commits, position: found };
}

/** The review header line: where in the series this commit is, and what it does. */
export function seriesTitle(review: ReviewSeries): string {
  const head = review.commits[review.position];
  if (head === undefined) {
    return review.repoName;
  }

  const place = `${review.position + 1}/${review.commits.length}`;
  return `${review.repoName} ${place} ${head.abbrev} ${head.subject}`;
}

export default function registerCommitLog(hunk: HunkExtensionAPI): void {
  const options: SeriesOptions = {
    range: configuredRange(hunk.config),
    limit: configuredLimit(hunk.config),
  };

  hunk.transformChangeset((changeset, ctx) => {
    series = [];
    position = null;

    // A throwing transform costs the reviewer the whole changeset, so every
    // failure here degrades to the review Hunk built without us.
    try {
      const review = resolveSeries(changeset.title, gitRunner(ctx.cwd), options, (message) =>
        hunk.log(message),
      );
      if (review === null) {
        return changeset;
      }

      series = review.commits;
      position = review.position;
      return { ...changeset, title: seriesTitle(review) };
    } catch (error) {
      hunk.log(`failed to resolve the commit series: ${String(error)}`);
      return changeset;
    }
  });
}
