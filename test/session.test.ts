import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  findSessionId,
  loadCommit,
  loadRange,
  pendingCommit,
  pendingRange,
  requestCommit,
  requestRange,
  resetPending,
  resetSessionId,
  type CommandRunner,
} from "../session.ts";
import { EMPTY_SERIES, publishSeries, selectedRange, seriesSnapshot } from "../store.ts";

const OWN_PID = 4242;
const SESSION_ID = "c47344a1-66d4-43b7-a898-b3058e129354";
const SHA = "73f50cf2".padEnd(40, "0");

function listing(...sessions: { pid: number; sessionId: string }[]): string {
  return JSON.stringify({ sessions });
}

interface FakeCli {
  run: CommandRunner;
  calls: string[][];
}

function fakeCli(answers: (args: readonly string[]) => string | null): FakeCli {
  const calls: string[][] = [];
  return {
    calls,
    run: (args) => {
      calls.push([...args]);
      return Promise.resolve(answers(args));
    },
  };
}

function daemon(options: { sessions?: string; reload?: string | null } = {}): FakeCli {
  return fakeCli((args) => {
    if (args[1] === "list") {
      return options.sessions ?? listing({ pid: OWN_PID, sessionId: SESSION_ID });
    }
    return options.reload === undefined ? "Reloaded session" : options.reload;
  });
}

beforeEach(() => {
  resetSessionId();
  resetPending();
  publishSeries(EMPTY_SERIES);
});

/** A daemon whose reloads finish only when the test says so. */
function deferredCli(): FakeCli & { finish: () => void } {
  const calls: string[][] = [];
  const waiting: ((value: string | null) => void)[] = [];
  return {
    calls,
    finish: () => {
      for (const resolve of waiting.splice(0)) {
        resolve("Reloaded session");
      }
    },
    run: (args) => {
      calls.push([...args]);
      return args[1] === "list"
        ? Promise.resolve(listing({ pid: OWN_PID, sessionId: SESSION_ID }))
        : new Promise((resolve) => {
            waiting.push(resolve);
          });
    },
  };
}

/** Let every microtask settle, the way the review loop does between frames. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function reloadedShas(calls: string[][]): (string | undefined)[] {
  return calls.filter((call) => call[1] === "reload").map((call) => call[5]);
}

test("the window is found by its own pid, not by its repository", () => {
  const rows = listing(
    { pid: 111, sessionId: "another-window" },
    { pid: OWN_PID, sessionId: SESSION_ID },
  );

  assert.equal(findSessionId(rows, OWN_PID), SESSION_ID);
});

test("a listing that names no such window resolves to nothing", () => {
  assert.equal(findSessionId(listing({ pid: 111, sessionId: "other" }), OWN_PID), null);
  assert.equal(findSessionId(listing(), OWN_PID), null);
  assert.equal(findSessionId("{}", OWN_PID), null);
  assert.equal(findSessionId("not json", OWN_PID), null);
  assert.equal(findSessionId(JSON.stringify({ sessions: [{ pid: OWN_PID }] }), OWN_PID), null);
});

test("loading a commit reloads this session with a revision show", async () => {
  const cli = daemon();

  const problem = await loadCommit(SHA, { run: cli.run, pid: OWN_PID });

  assert.equal(problem, null);
  assert.deepEqual(cli.calls, [
    ["session", "list", "--json"],
    ["session", "reload", SESSION_ID, "--", "show", SHA],
  ]);
});

test("loading a selected range reloads this session with a concrete diff", async () => {
  const cli = daemon();
  const range = `${"1".repeat(40)}..${"3".repeat(40)}`;

  const problem = await loadRange(range, { run: cli.run, pid: OWN_PID });

  assert.equal(problem, null);
  assert.deepEqual(cli.calls, [
    ["session", "list", "--json"],
    ["session", "reload", SESSION_ID, "--", "diff", range],
  ]);
});

test("the session id is resolved once and reused", async () => {
  const cli = daemon();

  await loadCommit(SHA, { run: cli.run, pid: OWN_PID });
  await loadCommit(SHA, { run: cli.run, pid: OWN_PID });

  assert.equal(cli.calls.filter((call) => call[1] === "list").length, 1);
  assert.equal(cli.calls.filter((call) => call[1] === "reload").length, 2);
});

test("an unknown window is reported instead of reloading blindly", async () => {
  const cli = daemon({ sessions: listing({ pid: 111, sessionId: "other" }) });

  const problem = await loadCommit(SHA, { run: cli.run, pid: OWN_PID });

  assert.match(problem ?? "", /session daemon/);
  assert.deepEqual(
    cli.calls.map((call) => call[1]),
    ["list"],
    "a window it cannot name is a window it must not steer",
  );
});

test("a refused reload names the commit that did not load", async () => {
  const cli = daemon({ reload: null });

  const problem = await loadCommit(SHA, { run: cli.run, pid: OWN_PID });

  assert.match(problem ?? "", /cannot load 73f50cf2/);
});

test("a request made while one is in flight runs after it", async () => {
  const cli = deferredCli();
  const deps = { run: cli.run, pid: OWN_PID };
  const quiet = () => {};

  requestCommit("a".repeat(40), quiet, deps);
  await settle();
  requestCommit("b".repeat(40), quiet, deps);
  assert.deepEqual(reloadedShas(cli.calls), ["a".repeat(40)], "one reload at a time");

  cli.finish();
  await settle();
  await settle();
  cli.finish();
  await settle();

  assert.deepEqual(reloadedShas(cli.calls), ["a".repeat(40), "b".repeat(40)]);
});

test("a burst of steps loads where the reviewer stopped, not every stop", async () => {
  const cli = deferredCli();
  const deps = { run: cli.run, pid: OWN_PID };
  const quiet = () => {};

  requestCommit("a".repeat(40), quiet, deps);
  await settle();
  requestCommit("b".repeat(40), quiet, deps);
  requestCommit("c".repeat(40), quiet, deps);

  cli.finish();
  await settle();
  await settle();
  cli.finish();
  await settle();

  assert.deepEqual(
    reloadedShas(cli.calls),
    ["a".repeat(40), "c".repeat(40)],
    "b was passed through, never stopped on",
  );
});

test("a range request coalesces behind an in-flight commit request", async () => {
  const cli = deferredCli();
  const deps = { run: cli.run, pid: OWN_PID };
  const selection = { anchor: 0, endpoint: 2, start: 0, end: 2, revisionRange: `${"1".repeat(40)}..${"3".repeat(40)}` };
  requestCommit("a".repeat(40), () => {}, deps);
  await settle();
  requestRange(selection, () => {}, deps);
  assert.equal(pendingRange(), null);
  cli.finish();
  await settle();
  assert.deepEqual(pendingRange(), selection);
  assert.equal(seriesSnapshot(), EMPTY_SERIES, "pending selection is not loaded state");
  cli.finish();
  await settle();
  assert.equal(pendingRange(), null);
  assert.deepEqual(cli.calls.filter((call) => call[1] === "reload").map((call) => call.slice(4)), [
    ["show", "a".repeat(40)], ["diff", selection.revisionRange],
  ]);
});

test("a refused range preserves loaded state and refreshes discovery on the next action", async () => {
  const cli = daemon({ reload: null });
  const deps = { run: cli.run, pid: OWN_PID };
  const commits = [1, 2].map((n) => ({ sha: String(n).repeat(40), abbrev: String(n).repeat(7), subject: `commit ${n}`, baseSha: String(n - 1).repeat(40) }));
  publishSeries({ commits, position: 0, range: null, message: { author: "Ada", timestamp: "date", body: "retained" } });
  const before = seriesSnapshot();
  const range = selectedRange(before, 0, 1);
  assert.ok(range);
  const warnings: string[] = [];
  requestRange(range, (message) => warnings.push(message), deps);
  await settle();
  assert.equal(seriesSnapshot(), before);
  assert.equal(pendingRange(), null);
  assert.match(warnings.join("\n"), /cannot load the selected range/);
  await loadCommit(SHA, deps);
  assert.equal(cli.calls.filter((call) => call[1] === "list").length, 2);
});

test("asking again for the commit already loading costs nothing", async () => {
  const cli = deferredCli();
  const deps = { run: cli.run, pid: OWN_PID };
  const quiet = () => {};

  requestCommit(SHA, quiet, deps);
  await settle();
  requestCommit(SHA, quiet, deps);

  cli.finish();
  await settle();
  await settle();

  assert.deepEqual(reloadedShas(cli.calls), [SHA]);
});

test("the pending target is what stepping counts from", async () => {
  const cli = deferredCli();
  const deps = { run: cli.run, pid: OWN_PID };

  assert.equal(pendingCommit(), null);
  requestCommit(SHA, () => {}, deps);
  await settle();
  assert.equal(pendingCommit(), SHA);

  cli.finish();
  await settle();
  await settle();

  assert.equal(pendingCommit(), null, "a settled window is not on its way anywhere");
});
