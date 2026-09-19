import assert from "node:assert/strict";
import { test } from "node:test";
import { clip, commitRow, rowText, seriesHeading, wrap } from "../row.ts";
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
    rowText(commitRow(COMMIT, 60, { active: true, selected: true })),
    " ▸ regenerate the open-api spec · 8610b105",
  );
  assert.equal(
    rowText(commitRow(COMMIT, 60, { active: false, selected: true })),
    " │ regenerate the open-api spec · 8610b105",
  );
  assert.equal(
    rowText(commitRow(COMMIT, 60, { active: false, selected: false })),
    "   regenerate the open-api spec · 8610b105",
  );
});

test("the marker leads in the accent only while its commit is the reviewed one", () => {
  const marker = (active: boolean) => commitRow(COMMIT, 60, { active, selected: true })[0]?.tone;

  assert.equal(marker(true), "accent");
  assert.equal(marker(false), "muted");
});

test("the sha rides at the end in the revision tone, behind its own separator", () => {
  const row = commitRow(COMMIT, 60, { active: true, selected: true });

  assert.deepEqual(row.slice(-2), [
    { text: " · ", tone: "separator" },
    { text: "8610b105", tone: "revision" },
  ]);
});

test("a conventional subject is painted in the history row, not only the message", () => {
  const row = commitRow(
    { ...COMMIT, subject: "feat(api)!: drop the legacy route" },
    60,
    { active: false, selected: false },
  );

  assert.deepEqual(row.map((segment) => segment.tone), [
    "muted",
    "added",
    "muted",
    "removed",
    "separator",
    "text",
    "separator",
    "revision",
  ]);
});

test("subjects take priority over hashes in narrow history rows", () => {
  const state = { active: true, selected: true };
  assert.equal(rowText(commitRow(COMMIT, 34, state)), " ▸ regenerate the open-api spec");
  assert.equal(rowText(commitRow(COMMIT, 22, state)), " ▸ regenerate the ope…");
});

test("a commit row never exceeds the pane width", () => {
  const state = { active: true, selected: true };
  for (const width of [1, 4, 12, 24, 39, 40]) {
    const painted = rowText(commitRow(COMMIT, width, state));
    assert.ok(painted.length <= width, `width ${width} produced ${painted.length} columns`);
  }
});

test("a conventional row is clipped across its segments, never past the pane", () => {
  const commit = { ...COMMIT, subject: "refactor(provider-kit): lower the strict tool schema" };
  for (const width of [1, 3, 8, 15, 30, 48]) {
    const painted = rowText(commitRow(commit, width, { active: true, selected: false }));
    assert.ok(painted.length <= width, `width ${width} produced ${painted.length} columns`);
  }
});

test("the heading distinguishes a loaded commit from an applied range", () => {
  assert.equal(seriesHeading(2, 8, 40), " Commits 3/8");
  assert.equal(seriesHeading(4, 8, 40, { start: 1, end: 4 }), " Applied 2–5/8");
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
