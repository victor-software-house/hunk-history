import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyRow, clipRow, messageRows, metaRow, subjectRow } from "../highlight.ts";
import type { CommitMessage, SeriesCommit } from "../store.ts";

const COMMIT: SeriesCommit = {
  sha: "8610b105".padEnd(40, "0"),
  abbrev: "8610b105",
  subject: "chore(supply-chain-node): regenerate the open-api spec",
};

const MESSAGE: CommitMessage = {
  author: "Ada Lovelace",
  date: "2026-08-01",
  body: "why it changed",
};

function tones(row: { text: string; tone: string }[]): string[] {
  return row.map((segment) => segment.tone);
}

function text(row: { text: string; tone: string }[]): string {
  return row.map((segment) => segment.text).join("");
}

test("the sha recedes and the conventional type leads the subject", () => {
  const row = subjectRow(COMMIT);

  assert.deepEqual(tones(row), ["muted", "accent", "text"]);
  assert.equal(row[1]?.text, "chore(supply-chain-node):");
  assert.equal(text(row), " 8610b105 chore(supply-chain-node): regenerate the open-api spec");
});

test("a subject with no conventional prefix is all one run", () => {
  const row = subjectRow({ ...COMMIT, subject: "Merge branch 'next' into topic" });

  assert.deepEqual(tones(row), ["muted", "text"]);
});

test("who wrote it is context, not content", () => {
  assert.deepEqual(tones(metaRow(MESSAGE)), ["muted"]);
});

test("body prose reads in the foreground tone", () => {
  assert.deepEqual(tones(bodyRow(" plain prose")), ["text"]);
});

test("identifiers in backticks are picked out of the prose", () => {
  const row = bodyRow(" call `resolveSeries` before painting");

  assert.deepEqual(tones(row), ["text", "accent", "text"]);
  assert.equal(row[1]?.text, "`resolveSeries`");
  assert.equal(text(row), " call `resolveSeries` before painting");
});

test("trailers recede, being metadata at the foot of the message", () => {
  assert.deepEqual(tones(bodyRow("Signed-off-by: Ada Lovelace <ada@example.com>")), ["muted"]);
  assert.deepEqual(tones(bodyRow("Fixes: 8610b105 (regenerate, 2026-08-01)")), ["muted"]);
});

test("prose that merely contains a colon is not a trailer", () => {
  assert.deepEqual(tones(bodyRow(" The rule is this: nothing wraps.")), ["text"]);
});

test("an indented block is quoted material, not prose", () => {
  assert.deepEqual(tones(bodyRow("     git rev-list --reverse main..HEAD")), ["accentMuted"]);
});

test("a list marker carries the structure and the rest the content", () => {
  const row = bodyRow(" - one reason per commit");

  assert.deepEqual(tones(row), ["accent", "text"]);
  assert.equal(row[0]?.text, " - ");
});

test("a blank line paints nothing", () => {
  assert.deepEqual(bodyRow(""), []);
});

test("a row is clipped across its segments, never past the pane", () => {
  const row = clipRow(subjectRow(COMMIT), 14);

  assert.equal(text(row).length, 14);
  assert.equal(text(row), " 8610b105 cho…");
});

test("the message is laid out for the pane it has", () => {
  const rows = messageRows(COMMIT, MESSAGE, 60, 8);

  assert.deepEqual(rows.map(text), [
    " 8610b105 chore(supply-chain-node): regenerate the open-api…",
    " Ada Lovelace  2026-08-01",
    "",
    " why it changed",
  ]);
});

test("a body too tall keeps its opening and counts the rest", () => {
  const body = ["one", "two", "three", "four", "five", "six"].join("\n");
  const rows = messageRows(COMMIT, { ...MESSAGE, body }, 60, 5);

  assert.equal(rows.length, 5);
  assert.equal(text(rows[4] ?? []), " +5 more lines");
  assert.deepEqual(tones(rows[4] ?? []), ["accentMuted"]);
});

test("no message fits in no rows", () => {
  assert.deepEqual(messageRows(COMMIT, MESSAGE, 60, 0), []);
});
