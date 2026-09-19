import type { SeriesCommit } from "./store.ts";

/**
 * A theme role, not a colour.
 *
 * The pane resolves these against the active theme, so a row keeps reading the
 * same way when the reviewer switches themes, and nothing here has to know what
 * colour anything is. The history roles deliberately mirror the ones Hunk's own
 * bundled review-info pane paints with, so the two lists agree on screen.
 */
export type Tone =
  | "text"
  | "muted"
  | "accent"
  | "accentMuted"
  | "revision"
  | "separator"
  | "author"
  | "time"
  | "added"
  | "modified"
  | "removed";

/** One run of characters that share a tone. */
export interface Segment {
  text: string;
  tone: Tone;
}

/** One painted row. */
export type Row = Segment[];

/** Marks the commit the review is showing. */
const CURRENT_MARKER = "▸";
const ELLIPSIS = "…";
/** `type`, `(scope)`, `!`, `:` as Conventional Commits writes them. */
const CONVENTIONAL = /^([a-z]+)(\([^)]*\))?(!)?(:)(\s.*)$/;
/**
 * What a commit kind does, said in the theme's own vocabulary.
 *
 * Only the type token is tinted, and only for the two kinds whose intent the
 * diff colours already name: a feature adds, a fix modifies. Every other type
 * stays on one accent so the column reads as structure rather than a rainbow.
 */
const TYPE_TONES: Readonly<Record<string, Tone>> = {
  feat: "added",
  fix: "modified",
};

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

/** The characters a row paints, with its tones dropped. */
export function rowText(row: Row): string {
  return row.map((segment) => segment.text).join("");
}

/** Trim a row to an exact column count, dropping whole segments past the edge. */
export function clipRow(row: Row, width: number): Row {
  const clipped: Row = [];
  let used = 0;

  for (const segment of row) {
    if (used >= width) {
      break;
    }
    const text = clip(segment.text, width - used);
    clipped.push({ text, tone: segment.tone });
    used += text.length;
  }

  return clipped;
}

/**
 * Split a subject on its Conventional Commits prefix.
 *
 * The type carries the intent, the scope says where, and `!` is the one part a
 * reviewer must not miss. The summary itself stays in the foreground tone: the
 * prefix is a label on the sentence, not louder than it.
 */
export function conventionalSegments(subject: string): Row {
  const parts = CONVENTIONAL.exec(subject);
  if (parts === null) {
    return [{ text: subject, tone: "text" }];
  }

  const [, type = "", scope, breaking, colon = "", summary = ""] = parts;
  const segments: Row = [{ text: type, tone: TYPE_TONES[type] ?? "accent" }];
  if (scope !== undefined) segments.push({ text: scope, tone: "muted" });
  if (breaking !== undefined) segments.push({ text: breaking, tone: "removed" });
  segments.push({ text: colon, tone: "separator" });
  segments.push({ text: summary, tone: "text" });
  return segments;
}

/**
 * One commit as it reads in a fixed-width column.
 *
 * The subject owns the row and the sha rides at the end, so a column too narrow
 * to hold both drops the sha rather than truncating what the commit says.
 */
export function commitRow(
  commit: SeriesCommit,
  width: number,
  state: { active: boolean; selected: boolean },
): Row {
  const marker = state.active ? CURRENT_MARKER : state.selected ? "│" : " ";
  const lead: Row = [
    { text: ` ${marker} `, tone: state.active ? "accent" : "muted" },
    ...conventionalSegments(commit.subject),
  ];
  const identified: Row = [
    ...lead,
    { text: " · ", tone: "separator" },
    { text: commit.abbrev, tone: "revision" },
  ];
  return clipRow(rowText(identified).length <= width ? identified : lead, width);
}

/** The pane's own heading: one commit position or the inclusive selected span. */
export function seriesHeading(
  position: number | null,
  total: number,
  width: number,
  range?: { start: number; end: number } | null,
): string {
  // An interval of one is a single commit, and reads as one rather than "5–5".
  const span = range !== null && range !== undefined && range.start !== range.end;
  const place = span
    ? `${range.start + 1}–${range.end + 1}/${total}`
    : position === null
      ? `${total}`
      : `${position + 1}/${total}`;
  const label = span ? "Applied" : "Commits";
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
