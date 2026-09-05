/**
 * One commit in the series behind the current review.
 *
 * Ordered oldest first everywhere in this extension, the way a patch series
 * reads, so the position shown in the header, the order of the rows in the
 * pane, and the direction the stepping keys will move all agree.
 */
export interface SeriesCommit {
  sha: string;
  abbrev: string;
  subject: string;
  /** Tree to compare against when this commit is the oldest selected one. */
  baseSha: string | null;
}

/** Everything the reviewed commit says beyond its subject. */
export interface CommitMessage {
  author: string;
  /** Git's strict ISO author timestamp, including the original UTC offset. */
  timestamp: string;
  /** The message body, subject line excluded; empty for a subject-only commit. */
  body: string;
}

/** One inclusive contiguous selection in the oldest-first commit series. */
export interface SeriesRange {
  readonly anchorSha: string;
  readonly endpointSha: string;
  readonly anchor: number;
  readonly endpoint: number;
  readonly start: number;
  readonly end: number;
  /** Concrete tree range passed to `hunk diff`. */
  readonly revisionRange: string;
}

/** What the panes paint: the series, active endpoint, optional range, and message. */
export interface SeriesSnapshot {
  /** Raw host review title, kept independently of the history scope. */
  readonly review?: string;
  /** Loaded commit remains identifiable when outside the visible scope. */
  readonly commit?: SeriesCommit | null;
  readonly commits: readonly SeriesCommit[];
  readonly scope?: string;
  /** Index into `commits`, or null when the review is not a commit-backed review. */
  readonly position: number | null;
  readonly range: SeriesRange | null;
  readonly message: CommitMessage | null;
}

export const EMPTY_SERIES: SeriesSnapshot = {
  commits: [],
  position: null,
  range: null,
  message: null,
};

let snapshot: SeriesSnapshot = EMPTY_SERIES;
const listeners = new Set<() => void>();

/**
 * The series the pane should be painting.
 *
 * Returns the same object until the series actually changes: React compares
 * snapshots by identity, and a fresh object on every read would re-render
 * without end.
 */
export function seriesSnapshot(): SeriesSnapshot {
  return snapshot;
}

/** Subscribe a mounted pane; panes unmount when closed, so the store outlives them. */
export function subscribeSeries(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The pane showing the message at its configured height. */
export const COLLAPSED_MESSAGE_PANE = "message";
/**
 * The heights an expanded message pane can take, smallest first.
 *
 * A ladder rather than a number, because a pane's height reaches Hunk once, at
 * registration, and no API resizes it afterwards: fitting the message means
 * registering several panes and opening the one that fits. The rungs are coarse
 * on purpose. Being two rows too tall is invisible; being thirty rows too tall
 * costs the diff the screen.
 */
export const EXPANDED_RUNGS = [8, 12, 18, 26, 36, 50] as const;

/** The pane id for one rung of the ladder. */
export function expandedPane(rows: number): string {
  return `messageExpanded${rows}`;
}

/**
 * The rows a message needs: the two heading rows, then the body after a blank.
 *
 * Counted from the body's own lines rather than from what the pane will paint,
 * because the pane's width is not known until it renders. A commit body is
 * already hard-wrapped by whoever wrote it, so on any terminal wide enough for
 * a diff this is exact; where a line does wrap, the pane is one rung short and
 * says so with its own count.
 */
export function messageRowsNeeded(message: CommitMessage): number {
  const body = message.body === "" ? 0 : message.body.split("\n").length + 1;
  return 2 + body;
}

/** The smallest rung that holds `needed` rows, or the tallest when none does. */
export function rungFor(needed: number): number {
  return EXPANDED_RUNGS.find((rows) => rows >= needed) ?? EXPANDED_RUNGS[EXPANDED_RUNGS.length - 1]!;
}

/**
 * Which message pane to open, and which to close, for a given state.
 *
 * An extension cannot resize a pane it registered: the height reaches Hunk once,
 * at registration, and `ctx.panes` only opens and closes. Expanding is therefore
 * a swap between two panes of the same component at two declared heights, and
 * this is the mapping both the expand key and the show-or-hide key read.
 */
export function messagePanes(message: CommitMessage | null): {
  collapsed: string;
  expanded: string;
} {
  return {
    collapsed: COLLAPSED_MESSAGE_PANE,
    expanded: expandedPane(message === null ? EXPANDED_RUNGS[0] : rungFor(messageRowsNeeded(message))),
  };
}

/**
 * The commit `delta` steps along the series from the reviewed one.
 *
 * Null at either end and outside a revision show. Stepping deliberately does
 * not wrap: arriving at the oldest commit of a branch by pressing "next" once
 * more would tell the reviewer nothing about where they are.
 */
export function neighbour(
  snapshot: SeriesSnapshot,
  delta: number,
  from: string | null = null,
): SeriesCommit | null {
  if (snapshot.position === null) {
    return null;
  }

  const requested = from === null ? -1 : snapshot.commits.findIndex((c) => c.sha === from);
  const base = requested < 0 ? snapshot.position : requested;
  return snapshot.commits[base + delta] ?? null;
}

/** Build one inclusive range from explicitly chosen endpoint rows. */
export function selectedRange(
  snapshot: SeriesSnapshot,
  anchor: number,
  endpoint: number,
): SeriesRange | null {
  if (
    anchor < 0 ||
    anchor >= snapshot.commits.length ||
    endpoint < 0 ||
    endpoint >= snapshot.commits.length ||
    anchor === endpoint
  ) {
    return null;
  }

  const start = Math.min(anchor, endpoint);
  const end = Math.max(anchor, endpoint);
  const oldest = snapshot.commits[start];
  const newest = snapshot.commits[end];
  if (!oldest?.baseSha || !newest) {
    return null;
  }

  return {
    anchorSha: snapshot.commits[anchor]!.sha,
    endpointSha: snapshot.commits[endpoint]!.sha,
    anchor,
    endpoint,
    start,
    end,
    revisionRange: `${oldest.baseSha}..${newest.sha}`,
  };
}

/** Remap exact endpoints after history changes, never infer a commit from its parent. */
export function remapRange(snapshot: SeriesSnapshot, range: SeriesRange): SeriesRange | null {
  return selectedRange(snapshot,
    snapshot.commits.findIndex((row) => row.sha === range.anchorSha),
    snapshot.commits.findIndex((row) => row.sha === range.endpointSha));
}

/** Report whether one row belongs to the current inclusive range. */
export function isSelectedIndex(snapshot: SeriesSnapshot, index: number): boolean {
  return snapshot.range === null
    ? index === snapshot.position
    : index >= snapshot.range.start && index <= snapshot.range.end;
}

/** Publish a range after its matching diff is loaded. */
export function publishRange(range: SeriesRange): void {
  publishSeries({
    ...snapshot,
    position: range.endpoint,
    commit: null,
    range,
    message: null,
  });
}

function sameMessage(left: CommitMessage | null, right: CommitMessage | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.author === right.author &&
    left.timestamp === right.timestamp &&
    left.body === right.body
  );
}

/** Compare range identity without making callers preserve object identity. */
function sameRange(left: SeriesRange | null, right: SeriesRange | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.anchorSha === right.anchorSha &&
    left.endpointSha === right.endpointSha &&
    left.anchor === right.anchor &&
    left.endpoint === right.endpoint &&
    left.start === right.start &&
    left.end === right.end &&
    left.revisionRange === right.revisionRange
  );
}

function sameSeries(left: SeriesSnapshot, right: SeriesSnapshot): boolean {
  return (
    left.review === right.review &&
    left.commit?.sha === right.commit?.sha &&
    left.position === right.position &&
    left.scope === right.scope &&
    sameRange(left.range, right.range) &&
    sameMessage(left.message, right.message) &&
    left.commits.length === right.commits.length &&
    left.commits.every((commit, index) => commit.sha === right.commits[index]?.sha)
  );
}

/**
 * Publish the series behind the review Hunk just loaded.
 *
 * Hunk reloads a review for reasons that leave the series alone, such as the
 * refresh key or a watch firing, so an unchanged series keeps the previous
 * snapshot and wakes nobody.
 */
export function publishSeries(next: SeriesSnapshot): void {
  if (sameSeries(snapshot, next)) {
    return;
  }

  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}
