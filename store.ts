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
}

/** Everything the reviewed commit says beyond its subject. */
export interface CommitMessage {
  author: string;
  date: string;
  /** The message body, subject line excluded; empty for a subject-only commit. */
  body: string;
}

/** What the panes paint: the series, which commit is on screen, and what it says. */
export interface SeriesSnapshot {
  readonly commits: readonly SeriesCommit[];
  /** Index into `commits`, or null when the review is not one commit. */
  readonly position: number | null;
  readonly message: CommitMessage | null;
}

export const EMPTY_SERIES: SeriesSnapshot = { commits: [], position: null, message: null };

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

function sameMessage(left: CommitMessage | null, right: CommitMessage | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.author === right.author && left.date === right.date && left.body === right.body;
}

function sameSeries(left: SeriesSnapshot, right: SeriesSnapshot): boolean {
  return (
    left.position === right.position &&
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
