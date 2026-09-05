import assert from "node:assert/strict";
import { test } from "node:test";
import { showSidebar } from "../sidebar.ts";

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
