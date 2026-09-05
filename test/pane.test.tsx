import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { TestRenderer } from "@opentui/core/testing";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { publishSeries, selectedRange, seriesSnapshot } from "../store.ts";
import { cancelHistoryGesture, rememberHistoryScroll, historySnapshot } from "../history.ts";
import { resetPending, resetSessionId, type SessionDeps } from "../session.ts";
import { CommitLogPane } from "../pane.tsx";
import { ScrollBoxRenderable } from "@opentui/core";

const requested: (readonly string[])[] = [];
let renderer: TestRenderer | undefined;
const commits = Array.from({ length: 100 }, (_, index) => ({
  sha: String(index + 1).padStart(40, "0"), abbrev: String(index + 1).padStart(7, "0"),
  subject: `Change ${index + 1}`, baseSha: String(index).padStart(40, "0"),
}));
const warnings: string[] = [];
let filesShown = 0;
const props: ExtensionPaneProps = {
  width: 34, height: 12, placement: "left", files: [], selectedFileId: null,
  selectedHunkIndex: null, currentLine: null,
  keybindings: { matches: () => false, getKeys: () => [] },
  actions: { notify: (message) => warnings.push(message), selectFile: () => {}, selectHunk: () => {}, revealLine: () => {} },
  theme: {
    appearance: "dark", background: "#101010", panel: "#101010", panelAlt: "#202020", border: "#606060",
    accent: "#00ffff", accentMuted: "#004444", text: "#ffffff", muted: "#aaaaaa", selectedHunk: "#303030",
    badgeAdded: "#00ff00", badgeRemoved: "#ff0000", badgeNeutral: "#aaaaaa", fileNew: "#00ff00",
    fileDeleted: "#ff0000", fileRenamed: "#ffff00", fileModified: "#ffff00", fileUntracked: "#aaaaaa", noteBorder: "#606060",
  },
};

function publishCommit(sha: string) {
  const snapshot = seriesSnapshot();
  const position = snapshot.commits.findIndex((commit) => commit.sha === sha);
  publishSeries({ ...snapshot, position, commit: snapshot.commits[position], range: null, review: `repo show ${sha}` });
}
function deps(reload: (args: readonly string[]) => Promise<string | null> = async (args) => {
  if (args[0] === "show") publishCommit(args[1]!);
  return "Reloaded";
}): SessionDeps {
  return { pid: 4242, run: async (args) => {
    if (args[1] === "list") return JSON.stringify({ sessions: [{ pid: 4242, sessionId: "pane" }] });
    requested.push(args.slice(4));
    return reload(args.slice(4));
  } };
}

beforeEach(() => {
  resetPending(); resetSessionId(); requested.length = 0; warnings.length = 0; filesShown = 0;
  publishSeries({ commits, position: 0, commit: commits[0], range: null, message: null, scope: "HEAD" });
  cancelHistoryGesture();
  rememberHistoryScroll(0);
});
afterEach(() => { act(() => { renderer?.destroy(); }); });

async function pane(session = deps(), width = 34) {
  const setup = await testRender(<CommitLogPane {...props} width={width} session={session}
    onFiles={() => { filesShown++; }} />, { width, height: 12 });
  renderer = setup.renderer;
  const renderFrame = async () => {
    await act(async () => { await setup.renderOnce(); });
    await act(async () => { await setup.renderOnce(); });
  };
  await renderFrame();
  return {
    ...setup,
    renderOnce: renderFrame,
    async clickId(id: string) {
      const row = setup.renderer.root.findDescendantById(id);
      assert.ok(row, `mounted ${id}`);
      assert.ok(row.y >= 0 && row.y < 12, `${id} visible at ${row.y}`);
      await act(async () => { await setup.mockMouse.click(row.x + 2, row.y); });
      await renderFrame();
    },
    async click(index: number) { await this.clickId(`commit-log-row-${index}`); },
    async double(index: number) { await this.click(index); await this.click(index); },
  };
}

for (const width of [22, 34, 60]) {
  test(`history keeps its heading and fixed status row at ${width} columns`, async () => {
    const ui = await pane(deps(), width);
    assert.match(ui.captureCharFrame(), /Commits/);
    assert.match(ui.captureCharFrame(), /Scope: HEAD/);
    const status = ui.renderer.root.findDescendantById("history-status");
    const working = ui.renderer.root.findDescendantById("review-staged");
    assert.ok(status && working);
    assert.equal(working.y, status.y + 1);
    await ui.double(1);
    assert.match(ui.captureCharFrame(), /Commits/);
    assert.match(ui.captureCharFrame(), /End · Esc/);
    assert.equal(ui.renderer.root.findDescendantById("review-staged")?.y, working.y);
  });
}

test("single clicks dispatch immediately, not after a double-click timeout", async () => {
  const ui = await pane();
  await ui.click(2);
  assert.deepEqual(requested, [["show", commits[2]!.sha]]);
  assert.equal(seriesSnapshot().commit?.sha, commits[2]!.sha);
  assert.doesNotMatch(ui.captureCharFrame(), /Opening|\[Range\]/);
});

for (const [start, end] of [[1, 4], [4, 1], [2, 2]]) {
  test(`double-click ${start}, endpoint ${end}: immediate first click and inclusive range`, async () => {
    const ui = await pane();
    await ui.double(start!);
    assert.match(ui.captureCharFrame(), /End · Esc/);
    assert.deepEqual(requested, [["show", commits[start!]!.sha]]);
    await ui.click(end!);
    assert.deepEqual(requested.at(-1), start === end ? ["show", commits[end!]!.sha]
      : ["diff", selectedRange(seriesSnapshot(), start!, end!)!.revisionRange]);
    assert.doesNotMatch(ui.captureCharFrame(), /End · Esc/);
  });
}

for (const timing of ["between-clicks", "after-arming", "after-endpoint"] as const) {
  test(`first commit response ${timing} cannot cancel double-click recognition or range intent`, async () => {
    let finish: (() => void) | undefined;
    const ui = await pane(deps(async (args) => {
      if (args[0] !== "show") return "Reloaded";
      return new Promise<string>((resolve) => { finish = () => { publishCommit(args[1]!); resolve("Reloaded"); }; });
    }));
    await ui.click(1);
    const complete = async () => { await act(async () => { finish!(); }); await ui.renderOnce(); };
    if (timing === "between-clicks") await complete();
    await ui.click(1);
    assert.match(ui.captureCharFrame(), /End · Esc/);
    if (timing === "after-arming") { await complete(); assert.match(ui.captureCharFrame(), /End · Esc/); }
    await ui.click(4);
    if (timing === "after-endpoint") await complete();
    assert.deepEqual(requested.at(-1), ["diff", selectedRange(seriesSnapshot(), 1, 4)!.revisionRange]);
    assert.doesNotMatch(ui.captureCharFrame(), /End · Esc/);
  });
}

test("Escape and external review replacement cancel the gesture, not the loaded review", async () => {
  const ui = await pane();
  await ui.double(1);
  await act(async () => { ui.mockInput.pressEscape(); await new Promise((resolve) => setTimeout(resolve, 40)); });
  await ui.renderOnce();
  assert.doesNotMatch(ui.captureCharFrame(), /End · Esc/);
  await ui.double(2);
  await act(async () => { cancelHistoryGesture(); }); await ui.renderOnce();
  assert.doesNotMatch(ui.captureCharFrame(), /End · Esc/);
  assert.equal(seriesSnapshot().commit?.sha, commits[2]!.sha);
});

test("working-state rows select without erasing history, Files remains exclusive", async () => {
  const ui = await pane();
  await ui.clickId("review-staged");
  assert.deepEqual(requested.at(-1), ["diff", "--staged", "--watch"]);
  await ui.clickId("review-unstaged");
  assert.deepEqual(requested.at(-1), ["diff", "--watch"]);
  assert.equal(seriesSnapshot().commits.length, 100);
  await ui.double(1);
  await ui.clickId("show-files");
  assert.equal(filesShown, 1);
  assert.doesNotMatch(ui.captureCharFrame(), /End · Esc/);
});

test("failed range restores the loaded selection after its pending highlight", async () => {
  let fail: (() => void) | undefined;
  const ui = await pane(deps(async (args) => {
    if (args[0] === "show") { publishCommit(args[1]!); return "Reloaded"; }
    return new Promise<null>((resolve) => { fail = () => resolve(null); });
  }));
  await ui.double(1); await ui.click(4);
  assert.match(ui.captureCharFrame(), /Loading/);
  const loaded = seriesSnapshot();
  await act(async () => { fail!(); }); await ui.renderOnce();
  assert.equal(seriesSnapshot(), loaded);
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(ui.captureCharFrame(), /Loading/);
});

test("history mounts only a bounded row window and scrolls to later commits", async () => {
  const ui = await pane();
  assert.equal(ui.renderer.root.findDescendantById("commit-log-row-90"), undefined);
  await act(async () => { publishCommit(commits[90]!.sha); });
  await ui.renderOnce(); await ui.renderOnce();
  assert.ok(ui.renderer.root.findDescendantById("commit-log-row-90"));
  assert.equal(ui.renderer.root.findDescendantById("commit-log-row-0"), undefined);
  assert.match(ui.captureCharFrame(), /Change 91/);
});

test("an armed endpoint survives scrolling while a drag never selects", async () => {
  const ui = await pane();
  await ui.double(0);
  await act(async () => {
    await ui.mockMouse.drag(15, 6, 33, 0);
    for (let i = 0; i < 6; i++) await ui.mockMouse.scroll(25, 10, "down");
  });
  await ui.renderOnce();
  assert.deepEqual(requested, []);
  assert.match(ui.captureCharFrame(), /End · Esc/);
  const endpoint = commits.findIndex((_, index) => {
    const row = ui.renderer.root.findDescendantById(`commit-log-row-${index}`);
    return index > 10 && row && row.y >= 3 && row.y < 12;
  });
  assert.ok(endpoint > 10);
  await ui.click(endpoint);
  assert.deepEqual(requested, [["diff", selectedRange(seriesSnapshot(), 0, endpoint)!.revisionRange]]);
});

test("hover keeps full-width selected backgrounds and never navigates", async () => {
  let finish: (() => void) | undefined;
  const ui = await pane(deps(async (args) => {
    if (args[0] === "show") { publishCommit(args[1]!); return "Reloaded"; }
    return new Promise<null>((resolve) => { finish = () => resolve(null); });
  }));
  const idle = ui.renderer.root.findDescendantById("commit-log-row-2")!;
  const before = ui.captureSpans().lines[idle.y];
  await act(async () => { await ui.mockMouse.moveTo(idle.x + 2, idle.y); }); await ui.renderOnce();
  assert.notDeepEqual(ui.captureSpans().lines[idle.y], before);
  assert.deepEqual(requested, []);
  await ui.double(1); await ui.click(4);
  const row = ui.renderer.root.findDescendantById("commit-log-row-2")!;
  await act(async () => { await ui.mockMouse.moveTo(row.x + 2, row.y); }); await ui.renderOnce();
  const selected = ui.captureSpans().lines[row.y]!.spans[0]!.bg;
  for (const index of [1, 2, 3, 4]) {
    const visible = ui.renderer.root.findDescendantById(`commit-log-row-${index}`)!;
    for (const span of ui.captureSpans().lines[visible.y]!.spans) assert.deepEqual(span.bg, selected);
  }
  await act(async () => { finish!(); });
});

test("double-click recognition and its anchor survive Hunk's full App remount", async () => {
  let ui = await pane();
  await ui.click(1);
  act(() => { renderer!.destroy(); });
  ui = await pane();
  await ui.click(1);
  assert.match(ui.captureCharFrame(), /End · Esc/);
  act(() => { renderer!.destroy(); });
  ui = await pane();
  assert.match(ui.captureCharFrame(), /End · Esc/);
  await ui.click(4);
  assert.deepEqual(requested, [["show", commits[1]!.sha], ["diff", selectedRange(seriesSnapshot(), 1, 4)!.revisionRange]]);
});

test("working-state reload remount keeps the browsed history viewport", async () => {
  let ui = await pane();
  await act(async () => { publishCommit(commits[90]!.sha); });
  await ui.renderOnce(); await ui.renderOnce();
  assert.match(ui.captureCharFrame(), /Change 91/);
  assert.ok(historySnapshot().scrollTop > 0, "scroll persisted before remount");
  await act(async () => {
    publishSeries({ ...seriesSnapshot(), position: null, commit: null, range: null, review: "repo staged changes" });
  });
  assert.ok(historySnapshot().scrollTop > 0, "scroll persisted after selecting staged");
  act(() => { renderer!.destroy(); });
  assert.ok(historySnapshot().scrollTop > 0, "scroll persisted after destroying old pane");
  ui = await pane();
  await ui.renderOnce();
  const view = ui.renderer.root.findDescendantById("history-scroll");
  assert.ok(view instanceof ScrollBoxRenderable);
  assert.ok(view.scrollTop > 0, JSON.stringify({ saved: historySnapshot().scrollTop, top: view.scrollTop, scroll: view.scrollHeight, content: view.content.height, viewport: view.viewport.height }));
  assert.match(ui.captureCharFrame(), /Change 91/);
  assert.match(ui.captureCharFrame(), /▸ Staged/);
});

test("the second click survives a host remount between its press and release", async () => {
  let ui = await pane();
  await ui.click(1);
  const row = ui.renderer.root.findDescendantById("commit-log-row-1")!;
  await act(async () => { await ui.mockMouse.pressDown(row.x + 2, row.y); });
  act(() => { renderer!.destroy(); });
  ui = await pane();
  const next = ui.renderer.root.findDescendantById("commit-log-row-1")!;
  await act(async () => { await ui.mockMouse.emitMouseEvent("up", next.x + 2, next.y); });
  await ui.renderOnce();
  assert.match(ui.captureCharFrame(), /End · Esc/);
  await ui.click(4);
  assert.deepEqual(requested.at(-1), ["diff", selectedRange(seriesSnapshot(), 1, 4)!.revisionRange]);
});
