import assert from "node:assert/strict";
import { test } from "node:test";
import { createSidebar, SIDEBAR_PANE } from "../sidebar.ts";

function fixture() {
  const visible = new Set<string>();
  const panes = {
    close(id: string) { visible.delete(id); },
    open(id: string) { assert.equal(id, SIDEBAR_PANE); visible.add(id); assert.ok(visible.size <= 1); },
    toggle(id: string) { if (visible.has(id)) this.close(id); else this.open(id); },
    isOpen(id: string) { return visible.has(id); },
  };
  return { sidebar: createSidebar(), panes, visible };
}

test("tabs select views without opening a second pane", () => {
  const { sidebar, panes, visible } = fixture();
  sidebar.show(panes, "files");
  sidebar.selectTab("history");
  assert.equal(sidebar.getTab(), "history");
  sidebar.selectTab("files");
  assert.equal(sidebar.getTab(), "files");
  assert.deepEqual([...visible], [SIDEBAR_PANE]);
});

test("h switches tabs without changing sidebar visibility", () => {
  const { sidebar, panes, visible } = fixture();
  sidebar.toggleTab();
  assert.equal(sidebar.getTab(), "files");
  assert.equal(visible.size, 0);
  sidebar.show(panes, "files");
  sidebar.toggleTab();
  assert.equal(sidebar.getTab(), "history");
  assert.deepEqual([...visible], [SIDEBAR_PANE]);
  sidebar.toggleTab();
  assert.equal(sidebar.getTab(), "files");
  assert.deepEqual([...visible], [SIDEBAR_PANE]);
});

test("s hides and shows either tab without changing its state", () => {
  const { sidebar, panes, visible } = fixture();
  for (const tab of ["files", "history"] as const) {
    sidebar.show(panes, tab);
    sidebar.rememberFilesScroll(30);
    sidebar.toggleSidebar(panes);
    assert.equal(visible.size, 0);
    assert.equal(sidebar.getTab(), tab);
    sidebar.toggleSidebar(panes);
    assert.deepEqual([...visible], [SIDEBAR_PANE]);
    assert.equal(sidebar.getTab(), tab);
    assert.equal(sidebar.getFilesScroll(), 30);
  }
});

test("tab and scroll state remain independent across runtimes", () => {
  const first = fixture();
  const second = fixture();
  let changes = 0;
  const unsubscribe = first.sidebar.subscribe(() => changes++);
  first.sidebar.show(first.panes, "files");
  first.sidebar.rememberFilesScroll(30);
  first.sidebar.selectTab("history");
  first.sidebar.selectTab("files");
  assert.equal(first.sidebar.getFilesScroll(), 30);
  assert.equal(second.sidebar.getFilesScroll(), 0);
  assert.equal(second.sidebar.getTab(), "history");
  assert.equal(changes, 3);
  unsubscribe();
  first.sidebar.selectTab("history");
  assert.equal(changes, 3);
});
