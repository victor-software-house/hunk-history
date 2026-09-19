import type { Row, Segment, Tone } from "./row.ts";
import { clipRow, conventionalSegments, wrap } from "./row.ts";
import type { CommitMessage, SeriesCommit } from "./store.ts";

export type { Row, Segment, Tone };
export { clipRow };

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
  return [
    { text: ` ${commit.abbrev} `, tone: "revision" },
    ...conventionalSegments(commit.subject),
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
  return [
    { text: ` ${message.author}`, tone: "author" },
    { text: "  ", tone: "separator" },
    { text: formatTimestamp(message.timestamp), tone: "time" },
  ];
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

/** Lay out the complete message for a fixed-width, scrollable presentation. */
export function messageRows(
  commit: SeriesCommit,
  message: CommitMessage,
  width: number,
): Row[] {
  if (width <= 0) return [];
  const body = message.body === "" ? []
    : wrap(message.body, width - 1).map((line) => line === "" ? "" : ` ${line}`);
  return [subjectRow(commit), metaRow(message), ...body.map(bodyRow)]
    .map((row) => clipRow(row, width));
}
