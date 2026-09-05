import { basename } from "node:path";
import { gitRunner, readPage, readWorktree, type GitRunner, type SeriesOptions } from "./series.ts";
import { EMPTY_SERIES, publishSeries, remapRange, seriesSnapshot, type SeriesCommit } from "./store.ts";

export interface HistorySnapshot {
  root: string | null;
  scope: string;
  loading: boolean;
  hasMore: boolean;
  staged: number;
  unstaged: number;
  error: string | null;
  newCommits: number;
  anchor: string | null;
  click: { sha: string; at: number } | null;
  pressed: string | null;
  scrollTop: number;
  /** Changes only when the repository/scope or an external review changes. */
  epoch: number;
}
let state: HistorySnapshot = {
  root: null, scope: "HEAD", loading: false, hasMore: false,
  staged: 0, unstaged: 0, error: null, newCommits: 0, anchor: null, click: null, pressed: null, scrollTop: 0, epoch: 0,
};
const listeners = new Set<() => void>();
export const historySnapshot = () => state;
export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: Partial<HistorySnapshot>): void {
  const updated = { ...state, ...next };
  if (Object.keys(updated).every((key) => Reflect.get(updated, key) === Reflect.get(state, key))) return;
  state = updated;
  for (const listener of listeners) listener();
}
export function cancelHistoryGesture(): void {
  publish({ epoch: state.epoch + 1, anchor: null, click: null, pressed: null });
}
export function setHistoryGesture(anchor: string | null, click: HistorySnapshot["click"] = null): void {
  publish({ anchor, click, pressed: null });
}
export function setHistoryPressed(pressed: string | null): void { publish({ pressed }); }
export function rememberHistoryScroll(scrollTop: number): void { publish({ scrollTop }); }
export function acknowledgeNewCommits(): void { publish({ newCommits: 0 }); }

/** One controller owns async Git, scope and polling; history never reloads the selected diff. */
export class HistoryController {
  private git: GitRunner | null = null;
  private generation = 0;
  private fingerprint: string | null = null;
  private loaded = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active: Promise<void> | null = null;
  private stopped = false;

  private options: SeriesOptions;
  private runner: typeof gitRunner;
  constructor(options: SeriesOptions, runner = gitRunner) {
    this.options = options;
    this.runner = runner;
  }

  async connect(cwd: string): Promise<boolean> {
    const git = this.runner(cwd);
    const root = await git(["rev-parse", "--show-toplevel"]);
    if (root === state.root && this.git) return true;
    this.generation++;
    this.git = root ? this.runner(root) : null;
    this.fingerprint = null;
    this.loaded = 0;
    publishSeries(EMPTY_SERIES);
    publish({ root, scope: this.options.range ?? "HEAD", hasMore: false, loading: false,
      staged: 0, unstaged: 0, error: null, newCommits: 0, anchor: null, click: null, pressed: null, scrollTop: 0, epoch: state.epoch + 1 });
    if (!root) return false;
    await this.refresh();
    return true;
  }

  async scope(ref: string): Promise<void> {
    if (!ref.trim() || ref.startsWith("-")) return;
    this.generation++;
    this.fingerprint = null;
    this.loaded = 0;
    publish({ scope: ref, epoch: state.epoch + 1, error: null, newCommits: 0, anchor: null, click: null, pressed: null, scrollTop: 0 });
    await this.refresh();
  }

  /** Serialize work and retry against the current generation after an old scope finishes. */
  async refresh(more = false): Promise<void> {
    if (this.active) {
      await this.active;
      if (this.stopped) return;
      return this.refresh(more);
    }
    if (!this.git || this.stopped) return;
    const operation = this.read(more);
    this.active = operation;
    try { await operation; } finally { if (this.active === operation) this.active = null; }
  }

  private async read(more: boolean): Promise<void> {
    const git = this.git!;
    const generation = this.generation;
    const scope = state.scope;
    const current = () => generation === this.generation && !this.stopped;
    try {
      const [refs, branch, worktree] = await Promise.all([
        git(["rev-parse", "--verify", "HEAD"]),
        git(["symbolic-ref", "-q", "HEAD"]),
        readWorktree(git),
      ]);
      if (!current()) return;
      if (!worktree) throw new Error("Cannot read working-tree status");
      publish(worktree);
      const resolved = scope === "HEAD" ? refs : await git(["rev-parse", "--revs-only", scope]);
      if (!current()) return;
      const fingerprint = `${branch}\n${resolved}`;
      if (!more && this.fingerprint === fingerprint) {
        publish({ error: null });
        return;
      }
      if (!refs && scope === "HEAD") {
        this.reconcile([]);
        this.loaded = 0;
        this.fingerprint = fingerprint;
        publish({ hasMore: false, error: null });
        return;
      }
      if (!resolved) throw new Error(`Scope unavailable: ${scope}`);
      // Pin page requests to resolved object ids, not a HEAD that can move mid-page.
      const pinnedScope = resolved.split("\n");
      const changed = fingerprint !== this.fingerprint;
      const existing = seriesSnapshot().commits;
      const oldTip = existing.at(-1);
      const tips = pinnedScope.filter((ref) => !ref.startsWith("^"));
      const exclusions = pinnedScope.filter((ref) => ref.startsWith("^")).join("\n");
      const previousExclusions = this.fingerprint?.split("\n").filter((ref) => ref.startsWith("^")).join("\n");
      if (changed && this.fingerprint && tips.length === 1 && exclusions === previousExclusions && oldTip &&
        await git(["merge-base", "--is-ancestor", oldTip.sha, tips[0]!]) !== null) {
        if (!current()) return;
        publish({ loading: true });
        const added: SeriesCommit[] = [];
        for (let skip = 0; ; skip += this.options.limit) {
          const page = await readPage(git, [tips[0]!, `^${oldTip.sha}`], this.options.limit, skip);
          if (!current()) return;
          if (!page) throw new Error("Cannot read new commits");
          added.push(...page);
          if (page.length < this.options.limit) break;
        }
        const commits = [...existing, ...added.reverse()];
        this.loaded = commits.length;
        this.fingerprint = fingerprint;
        this.reconcile(commits);
        publish({ newCommits: state.newCommits + added.length, error: null });
        return;
      }
      if (!current()) return;
      const count = changed ? Math.max(this.loaded, this.options.limit) : this.options.limit;
      const skip = more && !changed ? this.loaded : 0;
      publish({ loading: true });
      const page = await readPage(git, pinnedScope, count + 1, skip);
      if (!current()) return;
      if (!page) throw new Error(`Cannot load history for ${scope}`);
      const hasMore = page.length > count;
      const rows = page.slice(0, count);
      const commits = skip > 0 ? [...rows.reverse(), ...existing] : rows.reverse();
      this.loaded = commits.length;
      this.fingerprint = fingerprint;
      this.reconcile(commits);
      publish({ hasMore, error: null });
    } catch (error) {
      if (current()) publish({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (current()) publish({ loading: false });
    }
  }

  private reconcile(commits: ReturnType<typeof seriesSnapshot>["commits"]): void {
    const previous = seriesSnapshot();
    const selected = previous.commit?.sha ?? previous.commits[previous.position ?? -1]?.sha;
    const found = commits.findIndex((commit) => commit.sha === selected);
    const range = previous.range ? remapRange({ ...previous, commits }, previous.range) : null;
    publishSeries({ ...previous, commits, scope: state.scope,
      position: found < 0 ? null : found, range });
  }

  start(): void {
    if (this.timer || this.stopped) return;
    const tick = async () => {
      this.timer = null;
      await this.refresh();
      if (!this.stopped) this.timer = setTimeout(tick, 1_500);
    };
    this.timer = setTimeout(tick, 1_500);
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  get repoName(): string { return state.root ? basename(state.root) : ""; }
}
