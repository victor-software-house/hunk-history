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
export function commitRow(
  commit: SeriesCommit,
  width: number,
  state: { active: boolean; selected: boolean },
): string {
  const marker = state.active ? CURRENT_MARKER : state.selected ? "│" : " ";
  const subject = ` ${marker} ${commit.subject}`;
  const identified = `${subject} · ${commit.abbrev}`;
  return clip(identified.length <= width ? identified : subject, width);
}

/** The pane's own heading: one commit position or the inclusive selected span. */
export function seriesHeading(
  position: number | null,
  total: number,
  width: number,
  range?: { start: number; end: number } | null,
): string {
  const place =
    range !== null && range !== undefined
      ? `${range.start + 1}–${range.end + 1}/${total}`
      : position === null
        ? `${total}`
        : `${position + 1}/${total}`;
  const label = range ? "Applied" : "Commits";
  return clip(` ${label} ${place}`, width);
}

/**
 * Break text into lines that fit a column.
 *
 * Blank lines survive, because a commit body's paragraphs are the shape its
 * author gave it. A word longer than the column is broken rather than allowed
 * to overrun, which is what happens to a URL in a footer.
 */
export function wrap(text: string, width: number): string[] {
  if (width <= 0) {
    return [];
  }

  return text.split("\n").flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter((word) => word !== "");
    if (words.length === 0) {
      return [""];
    }

    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (line === "") {
        line = word;
      } else if (line.length + 1 + word.length <= width) {
        line = `${line} ${word}`;
      } else {
        lines.push(line);
        line = word;
      }

      while (line.length > width) {
        lines.push(line.slice(0, width));
        line = line.slice(width);
      }
    }

    if (line !== "") {
      lines.push(line);
    }
    return lines;
  });
}
