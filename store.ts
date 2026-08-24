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

/** What the pane paints: the series, and which of its commits is on screen. */
export interface SeriesSnapshot {
  readonly commits: readonly SeriesCommit[];
  /** Index into `commits`, or null when the review is not one commit. */
  readonly position: number | null;
}

export const EMPTY_SERIES: SeriesSnapshot = { commits: [], position: null };

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

function sameSeries(left: SeriesSnapshot, right: SeriesSnapshot): boolean {
  return (
    left.position === right.position &&
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
