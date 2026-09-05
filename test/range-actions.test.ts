import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { showRangeActions, type RangeDraft } from "../range-actions.ts";
import { publishSeries, seriesSnapshot } from "../store.ts";
import { resetPending, resetSessionId, type SessionDeps } from "../session.ts";
import { showSidebar } from "../sidebar.ts";

const commits = ["a", "b"].map((sha) => ({ sha, abbrev: sha, subject: sha, baseSha: `${sha}-parent` }));
const draft: RangeDraft = { start: null, end: null };
const requests: (readonly string[])[] = [];
const session: SessionDeps = {
  pid: 42,
  run: async (args) => {
    if (args[1] === "list") return JSON.stringify({ sessions: [{ pid: 42, sessionId: "menu" }] });
    requests.push(args.slice(4));
    return "Reloaded";
  },
};
beforeEach(() => {
  resetPending();
  resetSessionId();
  requests.length = 0;
  draft.start = null;
  draft.end = null;
  publishSeries({ commits, position: 0, range: null, message: null, scope: "main..topic" });
});

test("cancel leaves the draft intact and incomplete endpoints do not offer Apply", async () => {
  draft.start = "b";
  await showRangeActions("a", draft, {
    notify: () => assert.fail("unexpected notification"),
    dialogs: { select: async ({ title, options }) => {
      assert.match(title, /start b/);
      assert.deepEqual(options, ["Start here", "End here", "Clear range", "Show scope"]);
      return null;
    } },
  }, session);
  assert.deepEqual(draft, { start: "b", end: null });
  assert.deepEqual(requests, []);
});

test("an answer from a replaced series cannot set an endpoint", async () => {
  await showRangeActions("a", draft, {
    notify: () => {},
    dialogs: { select: async () => {
      publishSeries({ ...seriesSnapshot(), commits: [commits[1]!] });
      return "Start here";
    } },
  }, session);
  assert.equal(draft.start, null);
});

test("equal endpoints request one commit and scope remains available on demand", async () => {
  draft.start = "a";
  draft.end = "a";
  const notify: string[] = [];
  for (const answer of ["Apply 1–1", "Show scope"]) {
    await showRangeActions("a", draft, {
      notify: (message) => notify.push(message),
      dialogs: { select: async ({ options }) => { assert.ok(options.includes(answer)); return answer; } },
    }, session);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(requests, [["show", "a"]]);
  assert.deepEqual(notify, ["main..topic"]);
});

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
