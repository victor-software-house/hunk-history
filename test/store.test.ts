import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  EMPTY_SERIES,
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

  publishSeries({ commits: SERIES, position: 1 });

  assert.equal(woken, 1);
  assert.equal(seriesSnapshot().position, 1);
  assert.deepEqual(seriesSnapshot().commits, SERIES);
  unsubscribe();
});

test("an unchanged series keeps its snapshot and wakes nobody", () => {
  publishSeries({ commits: SERIES, position: 1 });
  const before = seriesSnapshot();
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: [commit(1), commit(2), commit(3)], position: 1 });

  assert.equal(woken, 0, "a refresh that changes nothing must not repaint");
  assert.equal(seriesSnapshot(), before, "React compares snapshots by identity");
  unsubscribe();
});

test("stepping to another commit in the same series is a change", () => {
  publishSeries({ commits: SERIES, position: 1 });
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: SERIES, position: 2 });

  assert.equal(woken, 1);
  assert.equal(seriesSnapshot().position, 2);
  unsubscribe();
});

test("a different history of the same length is a change", () => {
  publishSeries({ commits: SERIES, position: 0 });
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  publishSeries({ commits: [commit(4), commit(5), commit(6)], position: 0 });

  assert.equal(woken, 1);
  unsubscribe();
});

test("an unsubscribed pane stops hearing about reloads", () => {
  let woken = 0;
  const unsubscribe = subscribeSeries(() => {
    woken += 1;
  });

  unsubscribe();
  publishSeries({ commits: SERIES, position: 0 });

  assert.equal(woken, 0);
});
