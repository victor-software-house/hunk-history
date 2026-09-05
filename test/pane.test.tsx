import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { TestRenderer } from "@opentui/core/testing";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { publishSeries, selectedRange, seriesSnapshot } from "../store.ts";
import { resetPending, resetSessionId, type SessionDeps } from "../session.ts";
import { CommitLogPane } from "../pane.tsx";

const requested: (readonly string[])[] = [];
const session: SessionDeps = {
  pid: 4242,
  run: async (args) => {
    if (args[1] === "list")
      return JSON.stringify({ sessions: [{ pid: 4242, sessionId: "test-pane" }] });
    requested.push(args.slice(4));
    return "Reloaded";
  },
};
let renderer: TestRenderer | undefined;
afterEach(() => {
  act(() => {
    renderer?.destroy();
  });
});

const commits = Array.from({ length: 20 }, (_, index) => ({
  sha: String(index + 1).padStart(40, "0"),
  abbrev: String(index + 1).padStart(7, "0"),
  subject: `Change ${index + 1}`,
  baseSha: String(index).padStart(40, "0"),
}));
const warnings: string[] = [];
let filesShown = 0;
const props: ExtensionPaneProps = {
  width: 34,
  height: 12,
  placement: "left",
  files: [],
  selectedFileId: null,
  selectedHunkIndex: null,
  currentLine: null,
  keybindings: { matches: () => false, getKeys: () => [] },
  actions: {
    notify: (message) => warnings.push(message),
    selectFile: () => {},
    selectHunk: () => {},
    revealLine: () => {},
  },
  theme: {
    appearance: "dark",
    background: "#101010",
    panel: "#101010",
    panelAlt: "#202020",
    border: "#606060",
    accent: "#00ffff",
    accentMuted: "#004444",
    text: "#ffffff",
    muted: "#aaaaaa",
    selectedHunk: "#303030",
    badgeAdded: "#00ff00",
    badgeRemoved: "#ff0000",
    badgeNeutral: "#aaaaaa",
    fileNew: "#00ff00",
    fileDeleted: "#ff0000",
    fileRenamed: "#ffff00",
    fileModified: "#ffff00",
    fileUntracked: "#aaaaaa",
    noteBorder: "#606060",
  },
};

beforeEach(() => {
  resetPending();
  resetSessionId();
  requested.length = 0;
  warnings.length = 0;
  filesShown = 0;
  publishSeries({ commits, position: 0, range: null, message: null, scope: "main..topic" });
});

async function pane(deps: SessionDeps = session, width = props.width) {
  const setup = await testRender(<CommitLogPane {...props} width={width} session={deps}
    onFiles={() => { filesShown += 1; }} />, { width, height: 12 });
  renderer = setup.renderer;
  await setup.renderOnce();
  return {
    ...setup,
    async click(index: number, double = false) {
      const row = setup.renderer.root.findDescendantById(`commit-log-row-${index}`);
      assert.ok(row);
      assert.ok(row.y >= 1 && row.y < 12);
      await act(async () => {
        if (double) await setup.mockMouse.doubleClick(row.x + 2, row.y);
        else await setup.mockMouse.click(row.x + 2, row.y);
      });
      await setup.renderOnce();
    },
    async settle() {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 330)); });
      await setup.renderOnce();
    },
  };
}

for (const [start, end] of [[0, 3], [3, 0], [2, 2]] as const) {
  test(`double-click ${start}, click ${end}: inclusive range without an intermediate reload`, async () => {
    const ui = await pane();
    await ui.click(start, true);
    await ui.settle();
    assert.deepEqual(requested, []);
    assert.match(ui.captureCharFrame(), /End · Esc/);
    await ui.click(end);
    await ui.settle();
    assert.deepEqual(requested, [start === end ? ["show", commits[start]!.sha]
      : ["diff", selectedRange(seriesSnapshot(), start, end)!.revisionRange]]);
    assert.equal(seriesSnapshot().range, null, "loaded state changes only on successful publication");
    assert.doesNotMatch(ui.captureCharFrame(), /End · Esc/);
  });
}

test("single clicks navigate only after the double-click interval", async () => {
  const ui = await pane();
  await ui.click(1);
  assert.deepEqual(requested, []);
  await ui.settle();
  assert.deepEqual(requested, [["show", commits[1]!.sha]]);
});

test("Escape cancels armed range and pending single clicks", async () => {
  const ui = await pane();
  await ui.click(2, true);
  await act(async () => { ui.mockInput.pressEscape(); });
  await ui.settle();
  assert.doesNotMatch(ui.captureCharFrame(), /End · Esc/);
  await ui.click(1);
  await act(async () => { ui.mockInput.pressEscape(); });
  await ui.settle();
  assert.deepEqual(requested, []);
});

test("armed endpoint survives wheel scrolling; drag never applies a range", async () => {
  const ui = await pane();
  await ui.click(0, true);
  await act(async () => {
    await ui.mockMouse.drag(15, 4, 33, 0);
    for (let i = 0; i < 6; i += 1) await ui.mockMouse.scroll(25, 10, "down");
  });
  await ui.renderOnce();
  assert.deepEqual(requested, []);
  const end = commits.findIndex((_, index) => {
    const row = ui.renderer.root.findDescendantById(`commit-log-row-${index}`);
    return index > 10 && row && row.y >= 1 && row.y < 12;
  });
  assert.ok(end > 10);
  await ui.click(end);
  await ui.settle();
  assert.deepEqual(requested, [["diff", selectedRange(seriesSnapshot(), 0, end)!.revisionRange]]);
});

test("failed range leaves loaded selection intact", async () => {
  const ui = await pane({ ...session, run: async (args) => {
    if (args[4] === "diff") return null;
    return session.run(args);
  } });
  const loaded = seriesSnapshot();
  await ui.click(0, true);
  await ui.click(2);
  await ui.settle();
  assert.equal(seriesSnapshot(), loaded);
  assert.ok(warnings.length > 0);
});

test("compact header keeps Files away from divider and changes its hover paint", async () => {
  const ui = await pane(session, 22);
  const button = ui.renderer.root.findDescendantById("show-files");
  assert.ok(button);
  assert.ok(button.x + button.width < 20);
  assert.match(ui.captureCharFrame(), /\[Files\]/);
  assert.doesNotMatch(ui.captureCharFrame(), /⋯|Start|not set/);
  assert.equal(ui.renderer.root.findDescendantById("commit-log-row-10")?.y, 11);
  const before = ui.captureSpans();
  await act(async () => { await ui.mockMouse.moveTo(button.x + 2, button.y); });
  await ui.renderOnce();
  assert.notDeepEqual(ui.captureSpans(), before);
  await act(async () => { await ui.mockMouse.click(button.x + 2, button.y); });
  assert.equal(filesShown, 1);
});
