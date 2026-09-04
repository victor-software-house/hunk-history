import { clip, wrap } from "./row.ts";
import type { CommitMessage, SeriesCommit } from "./store.ts";

/**
 * A theme role, not a colour.
 *
 * The pane resolves these against the active theme, so a message keeps reading
 * the same way when the reviewer switches themes, and nothing here has to know
 * what colour anything is.
 */
export type Tone = "text" | "muted" | "accent" | "accentMuted";

/** One run of characters that share a tone. */
export interface Segment {
  text: string;
  tone: Tone;
}

/** One painted row of the message pane. */
export type Row = Segment[];

/** `type(scope):` and `type!:` as Conventional Commits writes them. */
const CONVENTIONAL_PREFIX = /^([a-z]+(?:\([^)]*\))?!?:)(\s.*)$/;
/** A trailer line: `Signed-off-by: …`, `Co-Authored-By: …`, `Fixes: …`. */
const TRAILER = /^[A-Z][A-Za-z-]*:\s\S/;
/** A list item, whose marker carries the structure and the rest the content. */
const BULLET = /^(\s*[-*]\s)(.*)$/;
/** Indented text: quoted code, a command line, a log excerpt. */
const INDENTED = /^(?: {4,}|\t)/;
/** Inline code, which a commit body uses for identifiers and paths. */
const CODE_SPAN = /`[^`]+`/g;
/** Git's `%aI` strict ISO timestamp. */
const GIT_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Split one run into code spans and everything between them. */
function withCodeSpans(text: string, tone: Tone): Segment[] {
  const segments: Segment[] = [];
  let index = 0;

  for (const match of text.matchAll(CODE_SPAN)) {
    const start = match.index;
    if (start > index) {
      segments.push({ text: text.slice(index, start), tone });
    }
    segments.push({ text: match[0], tone: "accent" });
    index = start + match[0].length;
  }

  if (index < text.length) {
    segments.push({ text: text.slice(index), tone });
  }
  return segments.length === 0 ? [{ text, tone }] : segments;
}

/** The commit and what it does: the sha recedes, the type leads, the summary reads. */
export function subjectRow(commit: SeriesCommit): Row {
  const conventional = CONVENTIONAL_PREFIX.exec(commit.subject);
  const heading: Row = [{ text: ` ${commit.abbrev} `, tone: "muted" }];

  if (conventional === null) {
    return [...heading, { text: commit.subject, tone: "text" }];
  }

  return [
    ...heading,
    { text: conventional[1] ?? "", tone: "accent" },
    { text: conventional[2] ?? "", tone: "text" },
  ];
}

/** Format a strict Git timestamp without converting away its original offset. */
export function formatTimestamp(timestamp: string): string {
  const match = GIT_TIMESTAMP.exec(timestamp);
  if (match === null) {
    return timestamp;
  }

  const [, year, monthText, dayText, hourText, minute, second, offset] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  if (!year || !MONTHS[month - 1] || day < 1 || day > 31 || hour > 23) {
    return timestamp;
  }

  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 || 12;
  const zone = offset === "Z" ? "UTC" : `UTC${offset}`;
  return `${MONTHS[month - 1]} ${day}, ${year} at ${displayHour}:${minute}:${second} ${period} ${zone}`;
}

/** Who wrote it and when, which is context rather than content. */
export function metaRow(message: CommitMessage): Row {
  return [{ text: ` ${message.author}  ${formatTimestamp(message.timestamp)}`, tone: "muted" }];
}

/**
 * One body line, toned by what it is.
 *
 * A commit body is prose with a few shapes in it, and the shapes are what a
 * reviewer skims for: what the change is about, the trailers at the end, the
 * command someone pasted, the identifiers in backticks.
 */
export function bodyRow(line: string): Row {
  if (line === "") {
    return [];
  }
  if (TRAILER.test(line)) {
    return [{ text: line, tone: "muted" }];
  }
  if (INDENTED.test(line)) {
    return [{ text: line, tone: "accentMuted" }];
  }

  const bullet = BULLET.exec(line);
  if (bullet !== null) {
    return [
      { text: bullet[1] ?? "", tone: "accent" },
      ...withCodeSpans(bullet[2] ?? "", "text"),
    ];
  }

  return withCodeSpans(line, "text");
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

/** The rows the message pane paints, laid out for its exact size. */
export function messageRows(
  commit: SeriesCommit,
  message: CommitMessage,
  width: number,
  height: number,
): Row[] {
  if (height <= 0 || width <= 0) {
    return [];
  }

  const body =
    message.body === ""
      ? []
      : ["", ...wrap(message.body, width - 1).map((line) => (line === "" ? "" : ` ${line}`))];
  const rows = [subjectRow(commit), metaRow(message), ...body.map(bodyRow)];

  if (rows.length <= height) {
    return rows.map((row) => clipRow(row, width));
  }

  const dropped = rows.length - (height - 1);
  return [
    ...rows.slice(0, height - 1).map((row) => clipRow(row, width)),
    [{ text: clip(` +${dropped} more lines`, width), tone: "accentMuted" }],
  ];
}
