import type { SeriesCommit } from "./store.ts";

/** Marks the commit the review is showing. */
const CURRENT_MARKER = "▸";
const ELLIPSIS = "…";

/**
 * Clip one line to an exact column count.
 *
 * Hunk owns the pane rectangle and does not wrap for us, so a row that
 * overruns its width is a row that corrupts the frame. Counted in code units,
 * which undercounts nothing in a commit subject that stays in ASCII and
 * overcounts a wide character; a wrong-by-one row beats a wrapped one.
 */
export function clip(line: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (line.length <= width) {
    return line;
  }

  return width === 1 ? ELLIPSIS : `${line.slice(0, width - 1)}${ELLIPSIS}`;
}

/** One commit as it reads in a fixed-width column. */
export function commitRow(commit: SeriesCommit, width: number, current: boolean): string {
  return clip(` ${current ? CURRENT_MARKER : " "} ${commit.abbrev} ${commit.subject}`, width);
}

/** The pane's own heading: what it lists, and how far through it the reviewer is. */
export function seriesHeading(position: number | null, total: number, width: number): string {
  const place = position === null ? `${total}` : `${position + 1}/${total}`;
  return clip(` Commits ${place}`, width);
}
