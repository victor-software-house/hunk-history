import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  COLLAPSED_MESSAGE_PANE,
  EMPTY_SERIES,
  EXPANDED_RUNGS,
  expandedPane,
  isSelectedIndex,
  messagePanes,
  messageRowsNeeded,
  neighbour,
  publishRange,
  publishSeries,
  rungFor,
  selectedRange,
  seriesSnapshot,
  subscribeSeries,
  type SeriesCommit,
} from "../store.ts";

function commit(n: number): SeriesCommit {
  return {
    sha: `${n}`.repeat(40),
    abbrev: `${n}`.repeat(7),
    subject: `subject ${n}`,
    baseSha: n === 1 ? "0".repeat(40) : `${n - 1}`.repeat(40),
  };
}

const SERIES = [commit(1), commit(2), commit(3)];

beforeEach(() => {
  publishSeries(EMPTY_SERIES);
});

test("a review with no series reads as empty", () => {
  assert.deepEqual(seriesSnapshot(), EMPTY_SERIES);
});

test("publishing a series wakes every subscriber", () => {
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: SERIES, position: 1, range: null, message: null });

  assert.equal(woken, 1);
  assert.equal(seriesSnapshot().position, 1);
  assert.deepEqual(seriesSnapshot().commits, SERIES);
  unsubscribe();
});

test("an unchanged series keeps its snapshot and wakes nobody", () => {
  publishSeries({ commits: SERIES, position: 1, range: null, message: null });
  const before = seriesSnapshot();
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: [commit(1), commit(2), commit(3)], position: 1, range: null, message: null });

  assert.equal(woken, 0, "a refresh that changes nothing must not repaint");
  assert.equal(seriesSnapshot(), before, "React compares snapshots by identity");
  unsubscribe();
});

test("stepping to another commit in the same series is a change", () => {
  publishSeries({ commits: SERIES, position: 1, range: null, message: null });
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: SERIES, position: 2, range: null, message: null });

  assert.equal(woken, 1);
  assert.equal(seriesSnapshot().position, 2);
  unsubscribe();
});

test("a different history of the same length is a change", () => {
  publishSeries({ commits: SERIES, position: 0, range: null, message: null });
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: [commit(4), commit(5), commit(6)], position: 0, range: null, message: null });

  assert.equal(woken, 1);
  unsubscribe();
});

test("an unsubscribed pane stops hearing about reloads", () => {
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  unsubscribe();
  publishSeries({ commits: SERIES, position: 0, range: null, message: null });

  assert.equal(woken, 0);
});

test("stepping moves along the series from the reviewed commit", () => {
  const snapshot = { commits: SERIES, position: 1, range: null, message: null } as const;

  assert.equal(neighbour(snapshot, 1)?.abbrev, "3333333");
  assert.equal(neighbour(snapshot, -1)?.abbrev, "1111111");
});

test("stepping stops at both ends rather than wrapping", () => {
  assert.equal(neighbour({ commits: SERIES, position: 2, range: null, message: null }, 1), null);
  assert.equal(neighbour({ commits: SERIES, position: 0, range: null, message: null }, -1), null);
});

test("stepping outside a commit review has nowhere to go", () => {
  assert.equal(neighbour({ commits: [], position: null, range: null, message: null }, 1), null);
  assert.equal(neighbour({ commits: SERIES, position: null, range: null, message: null }, -1), null);
});

test("stepping counts from the commit already being loaded", () => {
  const snapshot = { commits: SERIES, position: 2, range: null, message: null } as const;

  assert.equal(neighbour(snapshot, -1, SERIES[1]!.sha)?.abbrev, "1111111");
  assert.equal(neighbour(snapshot, -1, "unknown-sha")?.abbrev, "2222222");
  assert.equal(neighbour(snapshot, -1, SERIES[0]!.sha), null, "the edge holds while loading too");
});

test("selection spans inclusively between explicit endpoints", () => {
  const snapshot = { commits: SERIES, position: 2, range: null, message: null } as const;
  const range = selectedRange(snapshot, 2, 0);

  assert.deepEqual(range, {
    anchorSha: SERIES[2]!.sha,
    endpointSha: SERIES[0]!.sha,
    anchor: 2,
    endpoint: 0,
    start: 0,
    end: 2,
    revisionRange: `${SERIES[0]!.baseSha}..${SERIES[2]!.sha}`,
  });
});

test("each endpoint selection is independent of the previous one", () => {
  const snapshot = { commits: SERIES, position: 1, range: null, message: null } as const;

  assert.equal(selectedRange(snapshot, 1, 2)?.anchor, 1);
  assert.equal(selectedRange(snapshot, 2, 0)?.anchor, 2);
});

test("publishing a range selects every row and clears the single commit message", () => {
  publishSeries({
    commits: SERIES,
    position: 0,
    range: null,
    message: { author: "Ada", timestamp: "2026-08-01T00:00:00Z", body: "why" },
  });
  const range = selectedRange(seriesSnapshot(), 0, 2);
  assert.ok(range);

  publishRange(range);

  assert.equal(seriesSnapshot().position, 2);
  assert.equal(seriesSnapshot().message, null);
  assert.deepEqual(
    SERIES.map((_, index) => isSelectedIndex(seriesSnapshot(), index)),
    [true, true, true],
  );
});

test("a root commit uses its empty-tree base in an inclusive range", () => {
  const range = selectedRange(
    { commits: SERIES, position: 1, range: null, message: null },
    1,
    0,
  );

  assert.equal(range?.revisionRange, `${"0".repeat(40)}..${SERIES[1]!.sha}`);
});

test("an amended message repaints even when the series is identical", () => {
  publishSeries({ commits: SERIES, position: 1, range: null, message: { author: "Ada", timestamp: "d", body: "a" } });
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: SERIES, position: 1, range: null, message: { author: "Ada", timestamp: "d", body: "b" } });

  assert.equal(woken, 1);
  assert.equal(seriesSnapshot().message?.body, "b");
  unsubscribe();
});

test("the same message twice is not a change", () => {
  const message = { author: "Ada", timestamp: "d", body: "a" };
  publishSeries({ commits: SERIES, position: 1, range: null, message });
  const before = seriesSnapshot();
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: SERIES, position: 1, range: null, message: { ...message } });

  assert.equal(woken, 0);
  assert.equal(seriesSnapshot(), before);
  unsubscribe();
});

function message(bodyLines: number) {
  return {
    author: "Ada",
    timestamp: "2026-08-01T00:00:00Z",
    body: bodyLines === 0 ? "" : Array.from({ length: bodyLines }, (_, i) => `line ${i}`).join("\n"),
  };
}

test("a message needs its heading rows plus its body", () => {
  assert.equal(messageRowsNeeded(message(0)), 2, "subject and author, no blank line");
  assert.equal(messageRowsNeeded(message(1)), 3, "two heading rows and one body line");
  assert.equal(messageRowsNeeded(message(30)), 32);
});

test("the pane that fits is the smallest rung that holds the message", () => {
  assert.equal(rungFor(1), 8);
  assert.equal(rungFor(8), 8);
  assert.equal(rungFor(9), 12);
  assert.equal(rungFor(33), 36);
});

test("a message taller than every rung takes the tallest", () => {
  assert.equal(rungFor(400), EXPANDED_RUNGS[EXPANDED_RUNGS.length - 1]);
});

test("expanding picks the pane sized for this message", () => {
  assert.deepEqual(messagePanes(message(30)), {
    collapsed: COLLAPSED_MESSAGE_PANE,
    expanded: expandedPane(36),
  });
  assert.deepEqual(messagePanes(message(1)), {
    collapsed: COLLAPSED_MESSAGE_PANE,
    expanded: expandedPane(8),
  });
});

test("every rung is a distinct pane, and none is the collapsed one", () => {
  const ids = EXPANDED_RUNGS.map(expandedPane);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(COLLAPSED_MESSAGE_PANE));
});
