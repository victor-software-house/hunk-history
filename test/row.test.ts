import assert from "node:assert/strict";
import { test } from "node:test";
import { clip, commitRow, messageLines, seriesHeading, wrap } from "../row.ts";
import type { SeriesCommit } from "../store.ts";

const COMMIT: SeriesCommit = {
  sha: "8610b105".padEnd(40, "0"),
  abbrev: "8610b105",
  subject: "regenerate the open-api spec",
};

test("a line that fits is left alone", () => {
  assert.equal(clip("short", 10), "short");
  assert.equal(clip("exact", 5), "exact");
});

test("a line that overruns its column is clipped, never wrapped", () => {
  assert.equal(clip("abcdefgh", 4), "abc…");
  assert.equal(clip("abcdefgh", 1), "…");
  assert.equal(clip("abcdefgh", 0), "");
  assert.ok(clip("abcdefgh", 4).length <= 4);
});

test("the reviewed commit is the marked row", () => {
  assert.equal(commitRow(COMMIT, 60, true), " ▸ 8610b105 regenerate the open-api spec");
  assert.equal(commitRow(COMMIT, 60, false), "   8610b105 regenerate the open-api spec");
});

test("a commit row never exceeds the pane width", () => {
  for (const width of [1, 4, 12, 24, 39, 40]) {
    assert.ok(
      commitRow(COMMIT, width, true).length <= width,
      `width ${width} produced ${commitRow(COMMIT, width, true).length} columns`,
    );
  }
});

test("the heading counts the series from its oldest commit", () => {
  assert.equal(seriesHeading(2, 8, 40), " Commits 3/8");
  assert.equal(seriesHeading(null, 8, 40), " Commits 8");
  assert.ok(seriesHeading(2, 8, 6).length <= 6);
});

test("text is wrapped to the column it has to fit", () => {
  assert.deepEqual(wrap("one two three four", 9), ["one two", "three", "four"]);
  assert.deepEqual(wrap("short", 20), ["short"]);
  assert.deepEqual(wrap("", 20), [""]);
  assert.deepEqual(wrap("x", 0), []);
});

test("a commit body keeps the paragraphs its author wrote", () => {
  assert.deepEqual(wrap("first para\n\nsecond para", 20), ["first para", "", "second para"]);
});

test("a word too long for the column is broken, never overrun", () => {
  const lines = wrap("see https://example.com/a/very/long/path/indeed", 12);

  assert.deepEqual(lines, ["see", "https://exam", "ple.com/a/ve", "ry/long/path", "/indeed"]);
  assert.ok(lines.every((line) => line.length <= 12));
});

test("the message leads with the commit and who wrote it", () => {
  const lines = messageLines(
    COMMIT,
    { author: "Ada Lovelace", date: "2026-08-01", body: "why it had to change" },
    40,
    8,
  );

  assert.deepEqual(lines, [
    " 8610b105 regenerate the open-api spec",
    " Ada Lovelace  2026-08-01",
    "",
    " why it had to change",
  ]);
});

test("a subject-only commit shows no empty body", () => {
  const lines = messageLines(COMMIT, { author: "Ada", date: "2026-08-01", body: "" }, 40, 8);

  assert.equal(lines.length, 2);
});

test("a body too tall for the pane says how much it kept back", () => {
  const body = ["one", "two", "three", "four", "five", "six"].join("\n");
  const lines = messageLines(COMMIT, { author: "Ada", date: "2026-08-01", body }, 40, 5);

  assert.equal(lines.length, 5);
  assert.equal(lines.at(-1), " +5 more lines");
});

test("no message fits in no rows", () => {
  assert.deepEqual(messageLines(COMMIT, { author: "Ada", date: "d", body: "b" }, 40, 0), []);
});
