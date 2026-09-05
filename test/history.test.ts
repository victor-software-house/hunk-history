import assert from "node:assert/strict";
import { test } from "node:test";
import { HistoryController, historySnapshot, subscribeHistory } from "../history.ts";
import { publishSeries, selectedRange, seriesSnapshot } from "../store.ts";
import { gitFixture } from "./git-fixture.ts";
import { gitRunner } from "../series.ts";
import { join } from "node:path";

test("history pages beyond its initial limit and adds new commits without moving the review", async () => {
  const repo = gitFixture();
  const controller = new HistoryController({ range: null, limit: 2 });
  try {
    const shas = Array.from({ length: 5 }, (_, i) => repo.commit(`change ${i}`));
    await controller.connect(repo.root);
    assert.deepEqual(seriesSnapshot().commits.map((row) => row.sha), shas.slice(3));
    assert.equal(historySnapshot().hasMore, true);
    const commit = seriesSnapshot().commits[0]!;
    publishSeries({ ...seriesSnapshot(), commit, position: 0, review: `repo show ${commit.sha}`, message: null });
    await controller.refresh(true);
    await controller.refresh(true);
    assert.deepEqual(seriesSnapshot().commits.map((row) => row.sha), shas);
    assert.equal(historySnapshot().hasMore, false);
    const next = repo.commit("new while reading");
    await controller.refresh();
    assert.deepEqual(seriesSnapshot().commits.map((row) => row.sha), [...shas, next]);
    assert.equal(seriesSnapshot().commit?.sha, commit.sha);
    assert.equal(seriesSnapshot().commits[seriesSnapshot().position!]?.sha, commit.sha);
  } finally { controller.stop(); repo.close(); }
});

test("a pinned inclusive range survives new commits and working-state changes", async () => {
  const repo = gitFixture();
  const controller = new HistoryController({ range: null, limit: 4 });
  try {
    for (let i = 0; i < 4; i++) repo.commit(`change ${i}`);
    await controller.connect(repo.root);
    const range = selectedRange(seriesSnapshot(), 1, 3)!;
    publishSeries({ ...seriesSnapshot(), range, position: 3, review: `repo ${range.revisionRange}` });
    repo.commit("new"); repo.write("new.txt", "unstaged\n");
    await controller.refresh();
    assert.equal(seriesSnapshot().range?.revisionRange, range.revisionRange);
    assert.equal(historySnapshot().unstaged, 1);
    repo.git("add", "new.txt");
    await controller.refresh();
    assert.equal(historySnapshot().unstaged, 0);
    assert.equal(historySnapshot().staged, 1);
  } finally { controller.stop(); repo.close(); }
});

test("configured ranges stay explicit, can move, and do not broaden on errors", async () => {
  const repo = gitFixture();
  const controller = new HistoryController({ range: "base..HEAD", limit: 2 });
  try {
    repo.commit("base"); repo.git("tag", "base");
    const first = repo.commit("one");
    await controller.connect(repo.root);
    assert.deepEqual(seriesSnapshot().commits.map((row) => row.sha), [first]);
    const second = repo.commit("two");
    await controller.refresh();
    assert.deepEqual(seriesSnapshot().commits.map((row) => row.sha), [first, second]);
    await controller.scope("missing..HEAD");
    assert.match(historySnapshot().error ?? "", /Cannot load|unavailable/);
    assert.deepEqual(seriesSnapshot().commits.map((row) => row.sha), [first, second]);
    await controller.scope(first);
    repo.commit("three"); await controller.refresh();
    assert.equal(seriesSnapshot().commits.at(-1)?.sha, first);
  } finally { controller.stop(); repo.close(); }
});

test("unborn HEAD exposes working states and discovers the first commit", async () => {
  const repo = gitFixture();
  const controller = new HistoryController({ range: null, limit: 2 });
  try {
    repo.write("first.txt", "new\n");
    assert.equal(await controller.connect(repo.root), true);
    assert.equal(seriesSnapshot().commits.length, 0);
    assert.equal(historySnapshot().unstaged, 1);
    const first = repo.commit("initial"); await controller.refresh();
    assert.equal(seriesSnapshot().commits[0]?.sha, first);
  } finally { controller.stop(); repo.close(); }
});

test("branch rewrites retain loaded commit identity without keeping unrelated history", async () => {
  const repo = gitFixture();
  const controller = new HistoryController({ range: null, limit: 3 });
  try {
    repo.commit("base"); repo.commit("old"); await controller.connect(repo.root);
    const commit = seriesSnapshot().commits.at(-1)!;
    publishSeries({ ...seriesSnapshot(), commit, position: 1, review: `repo show ${commit.sha}` });
    repo.git("reset", "--hard", "HEAD~1"); repo.commit("replacement");
    await controller.refresh();
    assert.equal(seriesSnapshot().commit?.sha, commit.sha);
    assert.equal(seriesSnapshot().position, null);
    assert.ok(!seriesSnapshot().commits.some((row) => row.sha === commit.sha));
  } finally { controller.stop(); repo.close(); }
});

test("an old in-flight page cannot overwrite a newly chosen scope", async () => {
  const repo = gitFixture();
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  let block = false;
  const waiting = new Promise<void>((resolve) => { entered = resolve; });
  const controller = new HistoryController({ range: null, limit: 2 }, (cwd) => {
    const git = gitRunner(cwd);
    return async (args) => {
      if (block && args[0] === "log") {
        block = false;
        entered!();
        await new Promise<void>((resolve) => { release = resolve; });
      }
      return git(args);
    };
  });
  try {
    const first = repo.commit("first"); repo.commit("second"); repo.commit("third");
    await controller.connect(repo.root);
    block = true;
    const older = controller.refresh(true);
    await waiting;
    const changed = controller.scope(first);
    release!();
    await Promise.all([older, changed]);
    assert.equal(historySnapshot().scope, first);
    assert.deepEqual(seriesSnapshot().commits.map((row) => row.sha), [first]);
  } finally { release?.(); controller.stop(); repo.close(); }
});

test("background polling discovers a new commit without a diff reload", async () => {
  const repo = gitFixture();
  const controller = new HistoryController({ range: null, limit: 2 });
  let unsubscribe = () => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    repo.commit("first"); await controller.connect(repo.root);
    const review = seriesSnapshot().review;
    controller.start();
    const next = repo.commit("next");
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("history did not poll")), 8_000);
      unsubscribe = subscribeHistory(() => {
        if (seriesSnapshot().commits.at(-1)?.sha === next) resolve();
      });
    });
    assert.equal(seriesSnapshot().review, review);
    assert.equal(historySnapshot().newCommits, 1);
  } finally { clearTimeout(timeout); unsubscribe(); controller.stop(); repo.close(); }
});

test("linked worktrees use their own HEAD and index", async () => {
  const repo = gitFixture();
  const controller = new HistoryController({ range: null, limit: 2 });
  try {
    const first = repo.commit("first");
    const worktree = join(repo.root, "linked");
    repo.git("worktree", "add", "-b", "topic", worktree);
    repo.write("main-only.txt", "main change\n"); repo.git("add", "main-only.txt");
    await controller.connect(worktree);
    assert.equal(seriesSnapshot().commits.at(-1)?.sha, first);
    assert.equal(historySnapshot().staged, 0);
    assert.equal(historySnapshot().unstaged, 0);
  } finally { controller.stop(); repo.close(); }
});

test("more than one page of new commits never drops pinned range endpoints", async () => {
  const repo = gitFixture();
  const controller = new HistoryController({ range: null, limit: 2 });
  try {
    const first = repo.commit("first"); const second = repo.commit("second");
    await controller.connect(repo.root);
    const range = selectedRange(seriesSnapshot(), 0, 1)!;
    publishSeries({ ...seriesSnapshot(), range, position: 1, review: `repo ${range.revisionRange}` });
    const added = Array.from({ length: 5 }, (_, i) => repo.commit(`new ${i}`));
    await controller.refresh();
    assert.deepEqual(seriesSnapshot().commits.map((row) => row.sha), [first, second, ...added]);
    assert.equal(seriesSnapshot().range?.revisionRange, range.revisionRange);
    assert.equal(historySnapshot().newCommits, 5);
    assert.equal(historySnapshot().hasMore, false);
  } finally { controller.stop(); repo.close(); }
});
