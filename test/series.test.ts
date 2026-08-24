import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configuredLimit,
  configuredRange,
  DEFAULT_LIMIT,
  resolveSeries,
  seriesTitle,
  type GitRunner,
  type SeriesOptions,
} from "../series.ts";

const REPO_ROOT = "/checkouts/demo";
const REPO_NAME = "demo";

/** Five commits, oldest first, as the fake repository knows them. */
const HISTORY = [
  { sha: "1111111111111111111111111111111111111111", abbrev: "1111111", subject: "first" },
  { sha: "2222222222222222222222222222222222222222", abbrev: "2222222", subject: "second" },
  { sha: "3333333333333333333333333333333333333333", abbrev: "3333333", subject: "third" },
  { sha: "4444444444444444444444444444444444444444", abbrev: "4444444", subject: "fourth" },
  { sha: "5555555555555555555555555555555555555555", abbrev: "5555555", subject: "fifth" },
];

const DEFAULTS: SeriesOptions = { range: null, limit: DEFAULT_LIMIT };

interface FakeRepo {
  git: GitRunner;
  calls: string[][];
}

/**
 * A git that answers from `HISTORY` instead of a checkout.
 *
 * The seam exists so these tests never write history: a fixture repository
 * would need real commits, and the logic under test is which revisions get
 * asked for, not whether git can produce them.
 */
function fakeRepo(options: { ranges?: Record<string, string[]>; repoRoot?: string | null } = {}): FakeRepo {
  const calls: string[][] = [];
  const byRev = new Map<string, (typeof HISTORY)[number]>();
  for (const commit of HISTORY) {
    byRev.set(commit.sha, commit);
    byRev.set(commit.abbrev, commit);
  }
  byRev.set("HEAD", HISTORY[HISTORY.length - 1]!);

  const git: GitRunner = (args) => {
    calls.push([...args]);

    if (args[0] === "rev-parse") {
      return options.repoRoot === undefined ? REPO_ROOT : options.repoRoot;
    }

    if (args[0] === "log") {
      const rev = args[4] ?? "";
      const commit = byRev.get(rev);
      return commit === undefined ? null : `${commit.sha}\0${commit.abbrev}\0${commit.subject}`;
    }

    if (args[0] === "rev-list" && args[1] === "--reverse") {
      const range = options.ranges?.[args[2] ?? ""];
      return range === undefined ? null : range.join("\n");
    }

    if (args[0] === "rev-list" && args[1] === "-n") {
      const limit = Number(args[2]);
      const head = byRev.get(args[3] ?? "");
      if (head === undefined) {
        return null;
      }
      const upTo = HISTORY.slice(0, HISTORY.findIndex((commit) => commit.sha === head.sha) + 1);
      return upTo.slice(-limit).reverse().map((commit) => commit.sha).join("\n");
    }

    return null;
  };

  return { git, calls };
}

function silent(): (message: string) => void {
  return () => {};
}

test("a working-tree review is left alone", () => {
  const { git } = fakeRepo();
  const logs: string[] = [];

  const review = resolveSeries(`${REPO_NAME} working copy`, git, DEFAULTS, (m) => logs.push(m));

  assert.equal(review, null);
  assert.deepEqual(logs, []);
});

test("a title from another repository is left alone", () => {
  const { git } = fakeRepo();

  assert.equal(resolveSeries("other show HEAD", git, DEFAULTS, silent()), null);
});

test("a review outside a repository is left alone", () => {
  const { git } = fakeRepo({ repoRoot: null });

  assert.equal(resolveSeries(`${REPO_NAME} show HEAD`, git, DEFAULTS, silent()), null);
});

test("an unreadable ref reports itself and changes nothing", () => {
  const { git } = fakeRepo();
  const logs: string[] = [];

  const review = resolveSeries(`${REPO_NAME} show v9.9.9`, git, DEFAULTS, (m) => logs.push(m));

  assert.equal(review, null);
  assert.match(logs.join("\n"), /cannot read a commit for ref "v9\.9\.9"/);
});

test("the series ends at the reviewed commit, oldest first", () => {
  const { git } = fakeRepo();

  const review = resolveSeries(`${REPO_NAME} show ${HISTORY[2]!.abbrev}`, git, DEFAULTS, silent());

  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["1111111", "2222222", "3333333"]);
  assert.equal(review?.position, 2);
  assert.equal(review?.repoName, REPO_NAME);
});

test("a configured range that contains the commit is the series", () => {
  const range = "main..topic";
  const { git } = fakeRepo({ ranges: { [range]: HISTORY.slice(1, 4).map((commit) => commit.sha) } });

  const review = resolveSeries(`${REPO_NAME} show ${HISTORY[2]!.abbrev}`, git, { range, limit: 20 }, silent());

  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["2222222", "3333333", "4444444"]);
  assert.equal(review?.position, 1);
});

test("a configured range without the commit falls back and says so", () => {
  const range = "main..topic";
  const { git } = fakeRepo({ ranges: { [range]: [HISTORY[4]!.sha] } });
  const logs: string[] = [];

  const review = resolveSeries(
    `${REPO_NAME} show ${HISTORY[1]!.abbrev}`,
    git,
    { range, limit: 20 },
    (m) => logs.push(m),
  );

  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["1111111", "2222222"]);
  assert.equal(review?.position, 1);
  assert.match(logs.join("\n"), /range "main\.\.topic" does not contain 2222222/);
});

test("the limit bounds how much history one review gathers", () => {
  const { git, calls } = fakeRepo();

  const review = resolveSeries(`${REPO_NAME} show HEAD`, git, { range: null, limit: 2 }, silent());

  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["4444444", "5555555"]);
  assert.ok(calls.some((call) => call[0] === "rev-list" && call[2] === "2"));
});

test("a configured range never reaches git as an option", () => {
  assert.equal(configuredRange({ range: "--all" }), null);
  assert.equal(configuredRange({ range: "-p" }), null);
  assert.equal(configuredRange({ range: "  " }), null);
  assert.equal(configuredRange({ range: 3 }), null);
  assert.equal(configuredRange(undefined), null);
  assert.equal(configuredRange({ range: " main..HEAD " }), "main..HEAD");
});

test("a configured limit is clamped to a usable count", () => {
  assert.equal(configuredLimit({ limit: 3.9 }), 3);
  assert.equal(configuredLimit({ limit: 0 }), 1);
  assert.equal(configuredLimit({ limit: -5 }), 1);
  assert.equal(configuredLimit({ limit: 5_000 }), 500);
  assert.equal(configuredLimit({ limit: Number.NaN }), DEFAULT_LIMIT);
  assert.equal(configuredLimit({}), DEFAULT_LIMIT);
});

test("the header names the position, the commit, and what it does", () => {
  assert.equal(
    seriesTitle({ repoName: REPO_NAME, commits: HISTORY.slice(0, 3), position: 1 }),
    "demo 2/3 2222222 second",
  );
});
