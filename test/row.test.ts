import assert from "node:assert/strict";
import { test } from "node:test";
import { clip, commitRow, seriesHeading } from "../row.ts";
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
