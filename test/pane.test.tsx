import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { TestRenderer } from "@opentui/core/testing";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { publishRange, publishSeries, selectedRange, seriesSnapshot } from "../store.ts";
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
const props: ExtensionPaneProps = {
  width: 48,
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
  publishSeries({ commits, position: 0, range: null, message: null, scope: "main..topic" });
});

async function pane(deps: SessionDeps = session) {
  const setup = await testRender(<CommitLogPane {...props} session={deps} />, {
    width: 48,
    height: 12,
  });
  renderer = setup.renderer;
  await setup.renderOnce();
  return {
    ...setup,
    async click(id: string) {
      const target = setup.renderer.root.findDescendantById(id);
      assert.ok(target, `missing control ${id}`);
      assert.ok(target.y >= 0 && target.y < 12, `${id} is outside the visible pane`);
      await act(async () => {
        await setup.mockMouse.click(target.x + 1, target.y);
      });
      await setup.renderOnce();
    },
  };
}

test("Start/End do not load until Apply; Clear returns to one commit", async () => {
  const ui = await pane();
  assert.match(ui.captureCharFrame(), /Scope: main\.\.topic/);
  await ui.click("range-apply");
  assert.match(warnings[0] ?? "", /Choose Start and End/);
  await ui.click("range-start-2");
  await ui.click("range-end-0");
  assert.deepEqual(requested, []);
  assert.match(ui.captureCharFrame(), /Start: 0000003/);
  assert.match(ui.captureCharFrame(), /End:   0000001/);
  await ui.click("range-apply");
  const selection = selectedRange(seriesSnapshot(), 2, 0);
  assert.ok(selection);
  assert.deepEqual(requested, [["diff", selection.revisionRange]]);
  assert.equal(seriesSnapshot().range, null, "draft is not the loaded range");
  await act(async () => {
    publishRange(selection);
  });
  await ui.renderOnce();
  assert.match(ui.captureCharFrame(), /Applied 1–3\/20/);
  await ui.click("range-clear");
  assert.deepEqual(requested[1], ["show", commits[0]!.sha]);
  assert.match(ui.captureCharFrame(), /Start: not set/);
  assert.match(ui.captureCharFrame(), /End:   not set/);
});

test("single commits, equal endpoints and release outside the list need no drag state", async () => {
  const ui = await pane();
  await ui.click("commit-open-1");
  assert.deepEqual(requested, [["show", commits[1]!.sha]]);
  requested.length = 0;
  await ui.click("range-start-1");
  await ui.click("range-end-1");
  await ui.click("range-apply");
  assert.deepEqual(requested, [["show", commits[1]!.sha]]);
  requested.length = 0;
  await act(async () => {
    await ui.mockMouse.drag(15, 6, 47, 0);
  });
  await ui.renderOnce();
  assert.ok(
    requested.every((target) => target[0] === "show"),
    "drag must never apply a range",
  );
  await ui.click("range-clear");
  await ui.click("range-start-0");
  await ui.click("range-end-2");
  assert.match(ui.captureCharFrame(), /End:   0000003/);
});

test("endpoints survive scrolling without selecting intervening commits", async () => {
  const ui = await pane();
  await ui.click("range-start-0");
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await ui.mockMouse.scroll(25, 10, "down");
  });
  await ui.renderOnce();
  const rows = commits.map((_, index) => ui.renderer.root.findDescendantById(`range-end-${index}`));
  const visible = rows.findIndex((row, index) => index > 6 && row && row.y >= 5 && row.y < 12);
  assert.ok(visible > 6, "wheel must reach commits below the initial viewport");
  await ui.click(`range-end-${visible}`);
  assert.deepEqual(requested, []);
  await ui.click("range-apply");
  assert.deepEqual(requested, [
    ["diff", selectedRange(seriesSnapshot(), 0, visible)?.revisionRange],
  ]);
});

test("Clear during Apply queues the loaded commit, not a late range", async () => {
  let finish: ((value: string) => void) | undefined;
  const ui = await pane({
    pid: session.pid,
    run: async (args) => {
      const answer = await session.run(args);
      if (args[4] === "diff")
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      return answer;
    },
  });
  await ui.click("range-start-0");
  await ui.click("range-end-2");
  const range = selectedRange(seriesSnapshot(), 0, 2);
  assert.ok(range);
  await ui.click("range-apply");
  await ui.click("range-clear");
  assert.deepEqual(requested, [["diff", range.revisionRange]]);
  const complete = finish;
  assert.ok(complete);
  await act(async () => {
    complete("Reloaded");
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  });
  await ui.renderOnce();
  assert.deepEqual(requested, [
    ["diff", range.revisionRange],
    ["show", commits[0]!.sha],
  ]);
  assert.equal(seriesSnapshot().range, null);
  assert.match(ui.captureCharFrame(), /Start: not set/);
});
