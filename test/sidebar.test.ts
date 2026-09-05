import assert from "node:assert/strict";
import { test } from "node:test";
import { showSidebar, toggleFiles } from "../sidebar.ts";

test("sidebar swap closes the previous pane before opening its counterpart", () => {
  const open = new Set(["hunk:files"]);
  const calls: string[] = [];
  const panes = {
    close(id: string) { calls.push(`close ${id}`); open.delete(id); },
    open(id: string) { calls.push(`open ${id}`); open.add(id); assert.equal(open.size, 1); },
    toggle() { assert.fail("swap must be explicit"); },
    isOpen(id: string) { return open.has(id); },
  };
  showSidebar(panes, "commits");
  showSidebar(panes, "files");
  assert.deepEqual(calls, ["close hunk:files", "open commits", "close commits", "open hunk:files"]);
});

test("Files toggle and history switches never leave two panes open", () => {
  const open = new Set(["commits"]);
  const panes = {
    close(id: string) { open.delete(id); },
    open(id: string) { open.add(id); assert.ok(open.size <= 1); },
    toggle(id: string) { if (open.has(id)) open.delete(id); else this.open(id); },
    isOpen(id: string) { return open.has(id); },
  };
  toggleFiles(panes);
  assert.deepEqual([...open], ["hunk:files"]);
  showSidebar(panes, "commits");
  assert.deepEqual([...open], ["commits"]);
  toggleFiles(panes);
  toggleFiles(panes);
  assert.equal(open.size, 0);
  toggleFiles(panes);
  assert.deepEqual([...open], ["hunk:files"]);
  showSidebar(panes, "commits");
  assert.deepEqual([...open], ["commits"]);
});
