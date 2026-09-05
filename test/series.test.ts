import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredLimit, configuredMessageRows, configuredRange, DEFAULT_LIMIT, gitRunner, readPage, readMessage, readWorktree } from "../series.ts";
import { gitFixture } from "./git-fixture.ts";

test("config validates scope and treats limit as bounded page size", () => {
  for (const value of [null, {}, { range: " " }, { range: " --all" }]) assert.equal(configuredRange(value), null);
  assert.equal(configuredRange({ range: " main..HEAD " }), "main..HEAD");
  assert.equal(configuredLimit({}), DEFAULT_LIMIT);
  assert.equal(configuredLimit({ limit: 0 }), 1);
  assert.equal(configuredLimit({ limit: 1000 }), 500);
  assert.equal(configuredLimit({ limit: NaN }), DEFAULT_LIMIT);
  assert.equal(configuredMessageRows({}), 3);
  assert.equal(configuredMessageRows({ messageRows: 8 }), 8);
  assert.equal(configuredMessageRows({ messageRows: 1 }), 3);
  assert.equal(configuredMessageRows({ messageRows: 100 }), 60);
});

test("pages batch metadata newest first and retain root base and full message", async () => {
  const repo = gitFixture();
  try {
    const first = repo.commit("first\n\nA full body.");
    const second = repo.commit("second");
    const git = gitRunner(repo.root);
    const calls: string[][] = [];
    const page = await readPage(async (args) => { calls.push([...args]); return git(args); }, "HEAD", 1);
    assert.equal(page?.[0]?.sha, second);
    assert.equal(page?.[0]?.baseSha, first);
    assert.equal(calls.length, 1);
    const older = await readPage(git, "HEAD", 1, 1);
    assert.equal(older?.[0]?.sha, first);
    assert.equal(older?.[0]?.baseSha, repo.git("hash-object", "-t", "tree", "--stdin"));
    assert.equal((await readMessage(git, first))?.body, "A full body.");
    assert.equal((await readMessage(git, second))?.body, "");
    assert.equal(await readPage(git, "missing-ref", 1), null);
  } finally { repo.close(); }
});

test("porcelain counters distinguish mixed, staged, unstaged, untracked and rename records", async () => {
  const repo = gitFixture();
  try {
    repo.write("mixed.txt", "base\n"); repo.write("old name.txt", "base\n"); repo.commit("base");
    repo.write("mixed.txt", "staged\n"); repo.git("add", "mixed.txt");
    repo.write("mixed.txt", "unstaged\n"); repo.git("mv", "old name.txt", "new name.txt");
    repo.write("untracked\nname.txt", "new\n");
    assert.deepEqual(await readWorktree(gitRunner(repo.root)), { staged: 2, unstaged: 2 });
    repo.git("reset", "--hard", "HEAD"); repo.git("clean", "-fd");
    repo.write("mixed.txt", "only unstaged\n");
    assert.deepEqual(await readWorktree(gitRunner(repo.root)), { staged: 0, unstaged: 1 });
  } finally { repo.close(); }
});
