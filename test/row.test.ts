import assert from "node:assert/strict";
import { test } from "node:test";
import { clip, commitRow, seriesHeading, wrap } from "../row.ts";
import type { SeriesCommit } from "../store.ts";

const COMMIT: SeriesCommit = {
  sha: "8610b105".padEnd(40, "0"),
  abbrev: "8610b105",
  subject: "regenerate the open-api spec",
  baseSha: "7600a004".padEnd(40, "0"),
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
  assert.equal(
    commitRow(COMMIT, 60, { active: true, selected: true }),
    " ▸ 8610b105 regenerate the open-api spec",
  );
  assert.equal(
    commitRow(COMMIT, 60, { active: false, selected: true }),
    " │ 8610b105 regenerate the open-api spec",
  );
  assert.equal(
    commitRow(COMMIT, 60, { active: false, selected: false }),
    "   8610b105 regenerate the open-api spec",
  );
});

test("a commit row never exceeds the pane width", () => {
  const state = { active: true, selected: true };
  for (const width of [1, 4, 12, 24, 39, 40]) {
    assert.ok(
      commitRow(COMMIT, width, state).length <= width,
      `width ${width} produced ${commitRow(COMMIT, width, state).length} columns`,
    );
  }
});

test("the heading counts one commit or an inclusive range", () => {
  assert.equal(seriesHeading(2, 8, 40), " Commits 3/8");
  assert.equal(seriesHeading(4, 8, 40, { start: 1, end: 4 }), " Commits 2–5/8");
  assert.equal(seriesHeading(2, 8, 40, null, true), " Range 3/8  click/n/p  v exit");
  assert.equal(
    seriesHeading(4, 8, 40, { start: 1, end: 4 }, true),
    " Range 2–5/8  click/n/p  v exit",
  );
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
