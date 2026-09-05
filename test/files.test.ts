import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFlatSidebarEntries, buildTreeSidebarEntries, resolveFileSidebarMode, sidebarEntryStats, type SidebarFileSource } from "../vendor/hunk/files.ts";

const files: SidebarFileSource[] = [
  { id: "a", path: "src/a.ts", stats: { additions: 2, deletions: 0 }, changeType: "new" },
  { id: "b", path: "src/sub/b.ts", previousPath: "src/old.ts", stats: { additions: 3, deletions: 4 }, changeType: "rename-changed" },
  { id: "c", path: "README.md", stats: { additions: 0, deletions: 0 }, isUntracked: true },
  { id: "d", path: "src/d.ts", stats: { additions: 0, deletions: 1 }, changeType: "deleted" },
];

test("native flat and tree projections retain host review order and rename labels", () => {
  for (const build of [buildFlatSidebarEntries, buildTreeSidebarEntries]) {
    const rows = build(files).filter((entry) => entry.kind === "file");
    assert.deepEqual(rows.map((row) => row.id), ["a", "b", "c", "d"]);
    assert.equal(rows[1]?.name, "old.ts -> b.ts");
    assert.equal(rows[2]?.isUntracked, true);
    assert.equal(rows[3]?.changeType, "deleted");
    assert.deepEqual(sidebarEntryStats(rows[0]!), [{ kind: "addition", text: "+2" }]);
  }
  assert.equal(resolveFileSidebarMode(31), "flat");
  assert.equal(resolveFileSidebarMode(32), "tree");
});

test("native paths escape terminal controls and preserve significant spaces", () => {
  const rows = buildFlatSidebarEntries([{ ...files[0]!, path: "src/ name\t\u001b[31m.ts " }]);
  const row = rows.find((entry) => entry.kind === "file");
  assert.equal(row?.name, " name\\t\\x1b[31m.ts ");
});

test("native stats retain annotation and truncated-addition indicators", () => {
  const row = buildFlatSidebarEntries([{ ...files[0]!, statsTruncated: true, agent: { annotations: [{}, {}] } }])
    .find((entry) => entry.kind === "file");
  assert.ok(row);
  assert.deepEqual(sidebarEntryStats(row), [{ kind: "agent-comment", text: "*2" }, { kind: "addition", text: "+2+" }]);
});
