import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  COLLAPSED_MESSAGE_PANE,
  EMPTY_SERIES,
  EXPANDED_MESSAGE_PANE,
  messagePanes,
  neighbour,
  publishSeries,
  seriesSnapshot,
  subscribeSeries,
  type SeriesCommit,
} from "../store.ts";

function commit(n: number): SeriesCommit {
  return { sha: `${n}`.repeat(40), abbrev: `${n}`.repeat(7), subject: `subject ${n}` };
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

  publishSeries({ commits: SERIES, position: 1, message: null });

  assert.equal(woken, 1);
  assert.equal(seriesSnapshot().position, 1);
  assert.deepEqual(seriesSnapshot().commits, SERIES);
  unsubscribe();
});

test("an unchanged series keeps its snapshot and wakes nobody", () => {
  publishSeries({ commits: SERIES, position: 1, message: null });
  const before = seriesSnapshot();
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: [commit(1), commit(2), commit(3)], position: 1, message: null });

  assert.equal(woken, 0, "a refresh that changes nothing must not repaint");
  assert.equal(seriesSnapshot(), before, "React compares snapshots by identity");
  unsubscribe();
});

test("stepping to another commit in the same series is a change", () => {
  publishSeries({ commits: SERIES, position: 1, message: null });
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: SERIES, position: 2, message: null });

  assert.equal(woken, 1);
  assert.equal(seriesSnapshot().position, 2);
  unsubscribe();
});

test("a different history of the same length is a change", () => {
  publishSeries({ commits: SERIES, position: 0, message: null });
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: [commit(4), commit(5), commit(6)], position: 0, message: null });

  assert.equal(woken, 1);
  unsubscribe();
});

test("an unsubscribed pane stops hearing about reloads", () => {
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  unsubscribe();
  publishSeries({ commits: SERIES, position: 0, message: null });

  assert.equal(woken, 0);
});

test("stepping moves along the series from the reviewed commit", () => {
  const snapshot = { commits: SERIES, position: 1, message: null } as const;

  assert.equal(neighbour(snapshot, 1)?.abbrev, "3333333");
  assert.equal(neighbour(snapshot, -1)?.abbrev, "1111111");
});

test("stepping stops at both ends rather than wrapping", () => {
  assert.equal(neighbour({ commits: SERIES, position: 2, message: null }, 1), null);
  assert.equal(neighbour({ commits: SERIES, position: 0, message: null }, -1), null);
});

test("stepping outside a commit review has nowhere to go", () => {
  assert.equal(neighbour({ commits: [], position: null, message: null }, 1), null);
  assert.equal(neighbour({ commits: SERIES, position: null, message: null }, -1), null);
});

test("stepping counts from the commit already being loaded", () => {
  const snapshot = { commits: SERIES, position: 2, message: null } as const;

  assert.equal(neighbour(snapshot, -1, SERIES[1]!.sha)?.abbrev, "1111111");
  assert.equal(neighbour(snapshot, -1, "unknown-sha")?.abbrev, "2222222");
  assert.equal(neighbour(snapshot, -1, SERIES[0]!.sha), null, "the edge holds while loading too");
});

test("an amended message repaints even when the series is identical", () => {
  publishSeries({ commits: SERIES, position: 1, message: { author: "Ada", date: "d", body: "a" } });
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: SERIES, position: 1, message: { author: "Ada", date: "d", body: "b" } });

  assert.equal(woken, 1);
  assert.equal(seriesSnapshot().message?.body, "b");
  unsubscribe();
});

test("the same message twice is not a change", () => {
  const message = { author: "Ada", date: "d", body: "a" };
  publishSeries({ commits: SERIES, position: 1, message });
  const before = seriesSnapshot();
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: SERIES, position: 1, message: { ...message } });

  assert.equal(woken, 0);
  assert.equal(seriesSnapshot(), before);
  unsubscribe();
});

test("expanding swaps which message pane is open", () => {
  assert.deepEqual(messagePanes(false), {
    open: COLLAPSED_MESSAGE_PANE,
    close: EXPANDED_MESSAGE_PANE,
  });
  assert.deepEqual(messagePanes(true), {
    open: EXPANDED_MESSAGE_PANE,
    close: COLLAPSED_MESSAGE_PANE,
  });
});

test("the two message panes are distinct panes", () => {
  assert.notEqual(COLLAPSED_MESSAGE_PANE, EXPANDED_MESSAGE_PANE);
});
