import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configuredLimit,
  configuredMessageRows,
  configuredRange,
  DEFAULT_LIMIT,
  DEFAULT_MESSAGE_ROWS,
  readMessage,
  rangeTitle,
  resolveRangeReview,
  resolveSeries,
  seriesTitle,
  type GitRunner,
  type SeriesOptions,
} from "../series.ts";
import type { SeriesCommit, SeriesSnapshot } from "../store.ts";

const REPO_ROOT = "/checkouts/demo";
const REPO_NAME = "demo";
const EMPTY_TREE = "0".repeat(40);

/** Five commits, oldest first, as the fake repository knows them. */
const HISTORY: SeriesCommit[] = [
  {
    sha: "1".repeat(40),
    abbrev: "1111111",
    subject: "first",
    baseSha: EMPTY_TREE,
  },
  {
    sha: "2".repeat(40),
    abbrev: "2222222",
    subject: "second",
    baseSha: "1".repeat(40),
  },
  {
    sha: "3".repeat(40),
    abbrev: "3333333",
    subject: "third",
    baseSha: "2".repeat(40),
  },
  {
    sha: "4".repeat(40),
    abbrev: "4444444",
    subject: "fourth",
    baseSha: "3".repeat(40),
  },
  {
    sha: "5".repeat(40),
    abbrev: "5555555",
    subject: "fifth",
    baseSha: "4".repeat(40),
  },
];

const DEFAULTS: SeriesOptions = { range: null, limit: DEFAULT_LIMIT };

/** The revision range the extension reaches for when nothing is configured. */
const UNPUSHED = "@{upstream}..HEAD";

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
      const commit = byRev.get(args.at(-2) ?? "");
      if (commit === undefined) {
        return null;
      }
      if (args.some((arg) => arg.includes("%aI"))) {
        return commit.abbrev === "3333333"
          ? `Ada Lovelace\u00002026-08-01T21:04:05+03:00`
          : `Ada Lovelace\u00002026-08-01T21:04:05+03:00\u0000body of ${commit.abbrev}\n`;
      }
      const parents = commit.baseSha === EMPTY_TREE ? "" : commit.baseSha;
      return `${commit.sha}\0${commit.abbrev}\0${commit.subject}\0${parents}`;
    }

    if (args[0] === "hash-object") {
      return EMPTY_TREE;
    }

    if (args[0] === "rev-list" && args[1] === "--reverse") {
      return options.ranges?.[args[2] ?? ""]?.join("\n") ?? null;
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

test("the recent-history limit bounds the visible series", () => {
  const { git } = fakeRepo();
  const review = resolveSeries(`${REPO_NAME} show HEAD`, git, { range: null, limit: 2 }, silent());
  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["4444444", "5555555"]);
  assert.equal(review?.scope, "recent 2 through 5555555");
});

test("push state does not change an unconfigured review series", () => {
  const before = fakeRepo({ ranges: { [UNPUSHED]: HISTORY.slice(2).map((commit) => commit.sha) } });
  const after = fakeRepo({ ranges: { [UNPUSHED]: [] } });
  const title = `${REPO_NAME} show ${HISTORY[3]!.abbrev}`;
  const first = resolveSeries(title, before.git, DEFAULTS, silent());
  const second = resolveSeries(title, after.git, DEFAULTS, silent());
  assert.deepEqual(first, second);
  assert.deepEqual(first?.commits.map((commit) => commit.abbrev), ["1111111", "2222222", "3333333", "4444444"]);
  assert.equal(first?.scope, "recent 20 through 4444444");
  assert.ok(!before.calls.concat(after.calls).some((call) => call.includes(UNPUSHED)));
});

test("a configured range wins over recent history", () => {
  const range = "main..topic";
  const { git } = fakeRepo({ ranges: { [range]: HISTORY.slice(1, 4).map((commit) => commit.sha) } });
  const review = resolveSeries(`${REPO_NAME} show ${HISTORY[2]!.abbrev}`, git, { range, limit: 20 }, silent());
  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["2222222", "3333333", "4444444"]);
  assert.equal(review?.scope, range);
});

test("a configured range that contains the commit is the series", () => {
  const range = "main..topic";
  const { git } = fakeRepo({ ranges: { [range]: HISTORY.slice(1, 4).map((commit) => commit.sha) } });

  const review = resolveSeries(`${REPO_NAME} show ${HISTORY[2]!.abbrev}`, git, { range, limit: 20 }, silent());

  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["2222222", "3333333", "4444444"]);
  assert.equal(review?.position, 1);
});

test("a configured range without the commit never broadens into history", () => {
  const range = "main..topic";
  const { git, calls } = fakeRepo({ ranges: { [range]: [HISTORY[4]!.sha] } });
  const logs: string[] = [];
  const review = resolveSeries(`${REPO_NAME} show ${HISTORY[1]!.abbrev}`, git, { range, limit: 20 }, (m) => logs.push(m));
  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["2222222"]);
  assert.equal(review?.position, 0);
  assert.match(review?.scope ?? "", /scope unavailable/);
  assert.match(logs.join("\n"), /Cannot use range "main\.\.topic"/);
  assert.ok(!calls.some((call) => call[0] === "rev-list" && call[1] === "-n"));
});

test("an invalid configured revision reports failure without a history fallback", () => {
  const { git } = fakeRepo();
  const logs: string[] = [];
  const review = resolveSeries(`${REPO_NAME} show HEAD`, git, { range: "missing..HEAD", limit: 20 }, (message) => logs.push(message));
  assert.deepEqual(review?.commits, [HISTORY[4]]);
  assert.match(logs.join("\n"), /showing only the opened commit/);
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

test("an extension-initiated range keeps the held series visible", () => {
  const { git } = fakeRepo();
  const snapshot: SeriesSnapshot = {
    commits: HISTORY,
    position: 3,
    range: {
      anchor: 1,
      endpoint: 3,
      start: 1,
      end: 3,
      revisionRange: `${HISTORY[1]!.baseSha}..${HISTORY[3]!.sha}`,
    },
    message: null,
  };

  assert.deepEqual(
    resolveRangeReview(`${REPO_NAME} ${snapshot.range!.revisionRange}`, git, snapshot),
    { repoName: REPO_NAME },
  );
  assert.equal(rangeTitle(REPO_NAME, snapshot), "demo 2–4/5 2222222…4444444");
  assert.equal(resolveRangeReview(`${REPO_NAME} working tree`, git, snapshot), null);
});

test("stepping inside the series on screen keeps that series", () => {
  const { git, calls } = fakeRepo();
  const anchor = HISTORY.slice(1, 4);

  const review = resolveSeries(
    `${REPO_NAME} show ${HISTORY[1]!.abbrev}`,
    git,
    DEFAULTS,
    silent(),
    anchor,
  );

  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["2222222", "3333333", "4444444"]);
  assert.equal(review?.position, 0, "the position moves, the series does not");
  assert.ok(
    !calls.some((call) => call[0] === "rev-list"),
    "a held series needs no history walk at all",
  );
});

test("opening a commit outside the series on screen rebuilds it", () => {
  const { git } = fakeRepo();

  const review = resolveSeries(
    `${REPO_NAME} show ${HISTORY[4]!.abbrev}`,
    git,
    { range: null, limit: 2 },
    silent(),
    [HISTORY[0]!, HISTORY[1]!],
  );

  assert.deepEqual(review?.commits.map((commit) => commit.abbrev), ["4444444", "5555555"]);
  assert.equal(review?.position, 1);
});

test("the reviewed commit's message is read whole", () => {
  const { git } = fakeRepo();

  assert.deepEqual(readMessage(git, HISTORY[1]!.sha), {
    author: "Ada Lovelace",
    timestamp: "2026-08-01T21:04:05+03:00",
    body: "body of 2222222",
  });
});

test("a subject-only commit has an empty body, not a missing message", () => {
  const { git } = fakeRepo();

  assert.deepEqual(readMessage(git, HISTORY[2]!.sha), {
    author: "Ada Lovelace",
    timestamp: "2026-08-01T21:04:05+03:00",
    body: "",
  });
});

test("a message git cannot produce is no message", () => {
  const { git } = fakeRepo();

  assert.equal(readMessage(git, "v9.9.9"), null);
});

test("the message pane's starting height comes from configuration", () => {
  assert.equal(configuredMessageRows({ messageRows: 24 }), 24);
  assert.equal(configuredMessageRows({ messageRows: 12.7 }), 12);
  assert.equal(configuredMessageRows({}), DEFAULT_MESSAGE_ROWS);
  assert.equal(configuredMessageRows(undefined), DEFAULT_MESSAGE_ROWS);
  assert.equal(configuredMessageRows({ messageRows: "tall" }), DEFAULT_MESSAGE_ROWS);
});

test("a starting height stays inside what a pane can hold", () => {
  assert.equal(configuredMessageRows({ messageRows: 0 }), 3);
  assert.equal(configuredMessageRows({ messageRows: -20 }), 3);
  assert.equal(configuredMessageRows({ messageRows: 5_000 }), 60);
});
