import assert from "node:assert/strict";
import { test } from "node:test";
import { createSidebar } from "../sidebar.ts";

function fixture(initial: string[] = []) {
  const visible = new Set(initial);
  const calls: string[] = [];
  const panes = {
    close(id: string) { calls.push(`close ${id}`); visible.delete(id); },
    open(id: string) { calls.push(`open ${id}`); visible.add(id); assert.ok(visible.size <= 1); },
    toggle(id: string) { if (visible.has(id)) this.close(id); else this.open(id); },
    isOpen(id: string) { return visible.has(id); },
  };
  return { sidebar: createSidebar(), panes, visible, calls };
}

test("sidebar swap closes the previous pane before opening its counterpart", () => {
  const { sidebar, panes, calls } = fixture(["hunk:files"]);
  sidebar.show(panes, "commits");
  sidebar.show(panes, "files");
  assert.deepEqual(calls, ["close hunk:files", "open commits", "close commits", "open hunk:files"]);
});

test("h hides History without opening Files when Files was initially hidden", () => {
  const { sidebar, panes, visible } = fixture();
  for (let cycle = 0; cycle < 2; cycle++) {
    sidebar.toggleHistory(panes);
    assert.deepEqual([...visible], ["commits"]);
    sidebar.toggleHistory(panes);
    assert.deepEqual([...visible], []);
  }
});

test("h restores Files when History replaced it, including repeated show on reload", () => {
  const { sidebar, panes, visible } = fixture(["hunk:files"]);
  sidebar.show(panes, "commits");
  sidebar.show(panes, "commits");
  sidebar.toggleHistory(panes);
  assert.deepEqual([...visible], ["hunk:files"]);
  sidebar.toggleHistory(panes);
  sidebar.toggleHistory(panes);
  assert.deepEqual([...visible], ["hunk:files"]);
});

test("s remains exclusive and a subsequent h cycle remembers its new Files state", () => {
  const { sidebar, panes, visible } = fixture(["hunk:files"]);
  sidebar.show(panes, "commits");
  sidebar.toggleFiles(panes);
  assert.deepEqual([...visible], ["hunk:files"]);
  sidebar.toggleFiles(panes);
  assert.deepEqual([...visible], []);
  sidebar.toggleHistory(panes);
  sidebar.toggleHistory(panes);
  assert.deepEqual([...visible], []);
  sidebar.show(panes, "files");
  sidebar.toggleHistory(panes);
  sidebar.toggleHistory(panes);
  assert.deepEqual([...visible], ["hunk:files"]);
});

test("sidebar restoration does not leak between review runtimes", () => {
  const first = fixture(["hunk:files"]);
  const second = fixture();
  first.sidebar.show(first.panes, "commits");
  second.sidebar.show(second.panes, "commits");
  second.sidebar.toggleHistory(second.panes);
  first.sidebar.toggleHistory(first.panes);
  assert.deepEqual([...first.visible], ["hunk:files"]);
  assert.deepEqual([...second.visible], []);
});
