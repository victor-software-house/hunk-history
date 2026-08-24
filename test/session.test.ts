import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  findSessionId,
  loadCommit,
  requestCommit,
  resetSessionId,
  type CommandRunner,
} from "../session.ts";

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
});

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

test("a second click while one is in flight is dropped", async () => {
  const reported: string[] = [];
  let release: (value: string | null) => void = () => {};
  const calls: string[][] = [];
  const run: CommandRunner = (args) => {
    calls.push([...args]);
    return args[1] === "list"
      ? Promise.resolve(listing({ pid: OWN_PID, sessionId: SESSION_ID }))
      : new Promise((resolve) => {
          release = resolve;
        });
  };

  requestCommit(SHA, (message) => reported.push(message), { run, pid: OWN_PID });
  await new Promise((resolve) => setImmediate(resolve));
  requestCommit("f".repeat(40), (message) => reported.push(message), { run, pid: OWN_PID });
  release("Reloaded session");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls.filter((call) => call[1] === "reload").map((call) => call[5]), [SHA]);
  assert.deepEqual(reported, []);
});
