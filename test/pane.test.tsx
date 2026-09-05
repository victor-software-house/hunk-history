import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { MouseButtons, type MouseButton, type TestRenderer } from "@opentui/core/testing";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { publishRange, publishSeries, selectedRange, seriesSnapshot } from "../store.ts";
import { resetPending, resetSessionId, type SessionDeps } from "../session.ts";
import { CommitLogPane } from "../pane.tsx";
import { showRangeActions, type RangeDraft } from "../range-actions.ts";

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
const draft: RangeDraft = { start: null, end: null };
let answer: string | null = null;
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
  draft.start = null;
  draft.end = null;
  answer = null;
  filesShown = 0;
  publishSeries({ commits, position: 0, range: null, message: null, scope: "main..topic" });
});

async function pane(deps: SessionDeps = session, width = props.width) {
  const setup = await testRender(<CommitLogPane {...props} width={width} session={deps}
    onFiles={() => { filesShown += 1; }}
    onActions={(sha) => { void showRangeActions(sha, draft, {
      notify: props.actions.notify,
      dialogs: { select: async ({ options }) => {
        if (answer !== null) assert.ok(options.includes(answer), `missing menu option ${answer}`);
        return answer;
      } },
    }, deps); }} />, {
    width,
    height: 12,
  });
  renderer = setup.renderer;
  await setup.renderOnce();
  return {
    ...setup,
    async click(id: string, button: MouseButton = MouseButtons.LEFT) {
      const target = setup.renderer.root.findDescendantById(id);
      assert.ok(target, `missing control ${id}`);
      assert.ok(target.y >= 0 && target.y < 12, `${id} is outside the visible pane`);
      await act(async () => {
        await setup.mockMouse.click(target.x + 1, target.y, button);
      });
      await setup.renderOnce();
    },
  };
}

test("compact header leaves eleven full-width rows and Files switches view", async () => {
  const ui = await pane();
  const frame = ui.captureCharFrame();
  assert.match(frame, /Files.*⋯/);
  assert.doesNotMatch(frame, /Start|End|not set|Scope|\[Apply\]/);
  assert.equal(ui.renderer.root.findDescendantById("commit-log-row-0")?.y, 1);
  assert.equal(ui.renderer.root.findDescendantById("commit-log-row-10")?.y, 11);
  assert.equal(ui.renderer.root.findDescendantById("commit-log-row-0")?.width, 34);
  await ui.click("show-files");
  assert.equal(filesShown, 1);
  assert.deepEqual(requested, []);
});

test("menu endpoints do not load until Apply; Clear returns to one commit", async () => {
  const ui = await pane();
  answer = "Start here";
  await ui.click("range-actions");
  await ui.click("commit-log-row-2");
  requested.length = 0;
  await act(async () => { publishSeries({ ...seriesSnapshot(), position: 2 }); });
  await ui.renderOnce();
  answer = "End here";
  await ui.click("range-actions");
  assert.deepEqual(requested, []);
  answer = "Apply 1–3";
  await ui.click("range-actions");
  const selection = selectedRange(seriesSnapshot(), 0, 2);
  assert.ok(selection);
  assert.deepEqual(requested, [["diff", selection.revisionRange]]);
  assert.equal(seriesSnapshot().range, null);
  await act(async () => { publishRange(selection); });
  await ui.renderOnce();
  answer = "Clear range";
  await ui.click("range-actions");
  assert.deepEqual(requested[1], ["show", commits[2]!.sha]);
  assert.deepEqual(draft, { start: null, end: null });
});

test("single clicks and scrolling keep rows accessible without drag range state", async () => {
  const ui = await pane();
  await ui.click("commit-log-row-1");
  assert.deepEqual(requested, [["show", commits[1]!.sha]]);
  await act(async () => {
    await ui.mockMouse.drag(15, 6, 33, 0);
    for (let i = 0; i < 6; i += 1) await ui.mockMouse.scroll(25, 10, "down");
  });
  await ui.renderOnce();
  assert.ok(requested.every((target) => target[0] === "show"));
  const rows = commits.map((_, index) => ui.renderer.root.findDescendantById(`commit-log-row-${index}`));
  const visible = rows.findIndex((row, index) => index > 10 && row && row.y >= 1 && row.y < 12);
  assert.ok(visible > 10);
  await ui.click(`commit-log-row-${visible}`);
  assert.deepEqual(requested.at(-1), ["show", commits[visible]!.sha]);
});

test("right-click endpoints survive scrolling and cancelled menus without loading", async () => {
  const ui = await pane();
  answer = "Start here";
  await ui.click("commit-log-row-0", MouseButtons.RIGHT);
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await ui.mockMouse.scroll(25, 10, "down");
  });
  await ui.renderOnce();
  const visible = commits.findIndex((_, index) => {
    const row = ui.renderer.root.findDescendantById(`commit-log-row-${index}`);
    return index > 10 && row !== null && row !== undefined && row.y >= 1 && row.y < 12;
  });
  assert.ok(visible > 10);
  answer = "End here";
  await ui.click(`commit-log-row-${visible}`, MouseButtons.RIGHT);
  answer = null;
  await ui.click("range-actions");
  assert.deepEqual(draft, { start: commits[0]!.sha, end: commits[visible]!.sha });
  assert.deepEqual(requested, []);
});

test("minimum-width rows clip long subjects without wrapping or losing controls", async () => {
  publishSeries({ ...seriesSnapshot(), commits: commits.map((commit) => ({ ...commit, subject: "Long subject ".repeat(8) })) });
  const ui = await pane(session, 22);
  assert.match(ui.captureCharFrame(), /Files.*⋯/);
  assert.equal(ui.renderer.root.findDescendantById("commit-log-row-1")?.y, 2);
  assert.equal(ui.renderer.root.findDescendantById("commit-log-row-0")?.width, 22);
});

test("Clear during Apply queues the loaded commit, not a late range", async () => {
  let finish: ((value: string) => void) | undefined;
  const ui = await pane({
    pid: session.pid,
    run: async (args) => {
      const result = await session.run(args);
      if (args[4] === "diff") return new Promise<string>((resolve) => { finish = resolve; });
      return result;
    },
  });
  draft.start = commits[0]!.sha;
  draft.end = commits[2]!.sha;
  const range = selectedRange(seriesSnapshot(), 0, 2);
  assert.ok(range);
  answer = "Apply 1–3";
  await ui.click("range-actions");
  answer = "Clear range";
  await ui.click("range-actions");
  assert.deepEqual(requested, [["diff", range.revisionRange]]);
  assert.ok(finish);
  await act(async () => {
    finish!("Reloaded");
    await new Promise<void>((resolve) => { setImmediate(resolve); });
  });
  assert.deepEqual(requested, [["diff", range.revisionRange], ["show", commits[0]!.sha]]);
  assert.equal(seriesSnapshot().range, null);
});
