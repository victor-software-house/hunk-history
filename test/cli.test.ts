import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { historyInstructions } from "../cli.ts";

async function invoke(args: string[], signal = new AbortController().signal) {
  let stdout = "";
  let stderr = "";
  const result = await historyInstructions(args, {
    cwd: process.cwd(), signal,
    stdin: (async function* () {})(),
    stdout: { async write(chunk) { stdout += chunk; } },
    stderr: { async write(chunk) { stderr += chunk; } },
  });
  return { result, stdout, stderr };
}

test("instructions are the bundled skill verbatim", async () => {
  const output = await invoke(["instructions"]);
  assert.equal(output.stdout, await readFile(new URL("../skills/hunk-history/SKILL.md", import.meta.url), "utf8"));
  assert.equal(output.stderr, "");
  assert.deepEqual(output.result, { kind: "exit" });
});

test("help and invalid arguments use the correct stream and exit code", async () => {
  for (const args of [[], ["--help"], ["-h"]]) {
    const output = await invoke(args);
    assert.match(output.stdout, /Usage: hunk history instructions/);
    assert.equal(output.stderr, "");
    assert.deepEqual(output.result, { kind: "exit" });
  }
  for (const args of [["status"], ["instructions", "extra"]]) {
    const output = await invoke(args);
    assert.equal(output.stdout, "");
    assert.match(output.stderr, /Usage:/);
    assert.deepEqual(output.result, { kind: "exit", code: 2 });
  }
});

test("cancelled instruction reads reject instead of emitting stale output", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(invoke(["instructions"], controller.signal), { name: "AbortError" });
});
