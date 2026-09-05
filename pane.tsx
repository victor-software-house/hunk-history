import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MouseButton, type MouseEvent as TuiMouseEvent, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { messageRows, type Tone } from "./highlight.ts";
import { commitRow, seriesHeading, clip } from "./row.ts";
import { pendingReview, subscribePending, requestCommit, requestRange, requestWorking, type SessionDeps } from "./session.ts";
import { isSelectedIndex, selectedRange, remapRange, seriesSnapshot, subscribeSeries } from "./store.ts";
import { historySnapshot, subscribeHistory, acknowledgeNewCommits, setHistoryGesture, rememberHistoryScroll, rememberHistoryReveal, setHistoryPressed } from "./history.ts";

export interface CommitLogPaneProps extends ExtensionPaneProps {
  session?: SessionDeps;
  onMore?(): void;
}

const DOUBLE_CLICK_MS = 300;

export function CommitLogPane({ actions, width, height, theme, session, onMore }: CommitLogPaneProps): ReactNode {
  const snapshot = useSyncExternalStore(subscribeSeries, seriesSnapshot);
  const history = useSyncExternalStore(subscribeHistory, historySnapshot);
  const { commits, position, range } = snapshot;
  const pending = useSyncExternalStore(subscribePending, pendingReview);
  const pendingRange = pending?.kind === "range" ? pending.selection : null;
  const requestedRange = pendingRange ? remapRange(snapshot, pendingRange) : null;
  const painted = requestedRange
    ? { ...snapshot, range: requestedRange, position: requestedRange.endpoint }
    : pending?.kind === "commit"
      ? { ...snapshot, range: null, position: commits.findIndex((commit) => commit.sha === pending.value) }
      : pending ? { ...snapshot, range: null, position: null } : snapshot;
  const scroll = useRef<ScrollBoxRenderable | null>(null);
  const anchor = history.anchor;
  const [hovered, setHovered] = useState<string | null>(null);
  const [offset, setOffset] = useState(history.scrollTop);
  const previousRows = useRef(commits);
  const busy = pending !== null || history.loading;
  const [frame, setFrame] = useState(0);
  const loadedSha = snapshot.commit?.sha ?? commits[position ?? -1]?.sha;
  const loaded = useRef(loadedSha);
  loaded.current = loadedSha;
  const updateViewport = useRef<() => void>(() => {});

  const cancel = () => { setHistoryGesture(null); };
  // The host remounts App on daemon reload: gestures live outside this component.
  useEffect(() => { setHovered(null); }, [history.epoch]);
  useEffect(() => { if (anchor && !commits.some((row) => row.sha === anchor)) cancel(); }, [commits, anchor]);
  useKeyboard((key) => {
    const click = historySnapshot().click;
    if (key.name !== "escape" || (anchor === null && (!click || Date.now() - click.at > DOUBLE_CLICK_MS))) return;
    key.stopPropagation();
    cancel();
  });

  const choose = (sha: string) => {
    const { anchor, click } = historySnapshot();
    if (anchor !== null) {
      const start = commits.findIndex((commit) => commit.sha === anchor);
      const end = commits.findIndex((commit) => commit.sha === sha);
      cancel();
      if (start === end) requestCommit(sha, actions.notify, session);
      else {
        const selection = selectedRange(snapshot, start, end);
        if (selection) requestRange(selection, actions.notify, session);
      }
      return;
    }
    const now = Date.now();
    if (click?.sha === sha && now - click.at <= DOUBLE_CLICK_MS) {
      setHistoryGesture(sha);
      return;
    }
    setHistoryGesture(null, { sha, at: now });
    if (sha === commits.at(-1)?.sha) acknowledgeNewCommits();
    if (range !== null || commits[position ?? -1]?.sha !== sha || pending !== null)
      requestCommit(sha, actions.notify, session);
  };

  const renderer = useRenderer();
  useEffect(() => {
    const view = scroll.current;
    if (!view) return;
    let restore = historySnapshot().scrollTop;
    let active = true;
    const update = () => {
      if (!active || view.viewport.height <= 0) return;
      if (restore > 0) {
        const target = Math.min(restore, Math.max(0, view.scrollHeight - view.viewport.height));
        restore = 0;
        view.scrollTop = target;
      }
      const sha = loaded.current;
      if (sha && sha !== historySnapshot().revealedSha) {
        const row = seriesSnapshot().commits.findIndex((commit) => commit.sha === sha);
        if (row >= 0 && view.scrollHeight > 0) {
          rememberHistoryReveal(sha);
          if (row < view.scrollTop) view.scrollTop = row;
          else if (row >= view.scrollTop + view.viewport.height) view.scrollTop = row - view.viewport.height + 1;
        }
      }
      setOffset(view.scrollTop);
      rememberHistoryScroll(view.scrollTop);
    };
    const afterLayout = () => { queueMicrotask(update); };
    view.verticalScrollBar.on("change", update);
    renderer.root.on("layout-changed", afterLayout);
    update();
    updateViewport.current = update;
    return () => {
      active = false;
      view.verticalScrollBar.off("change", update);
      renderer.root.off("layout-changed", afterLayout);
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setFrame((value) => (value + 1) % 4), 100);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    const view = scroll.current;
    const old = previousRows.current;
    if (!view || old === commits) return;
    const first = old[Math.max(0, Math.floor(view.scrollTop))];
    const index = first ? commits.findIndex((row) => row.sha === first.sha) : -1;
    if (index >= 0 && first) view.scrollTop += index - old.indexOf(first);
    previousRows.current = commits;
    setOffset(view.scrollTop);
  }, [commits]);
  useEffect(() => { queueMicrotask(() => updateViewport.current()); }, [loadedSha]);

  const start = Math.max(0, Math.floor(offset) - 8);
  const end = Math.min(commits.length, start + Math.max(1, height) + 16);
  const handlers = (id: string, action: () => void) => ({
    onMouseOver: () => setHovered(id),
    onMouseOut: () => setHovered(null),
    onMouseDown: (event: TuiMouseEvent) => {
      if (event.button !== MouseButton.LEFT) return;
      event.stopPropagation(); event.preventDefault(); setHistoryPressed(id);
    },
    onMouseDrag: () => { setHistoryGesture(historySnapshot().anchor); },
    onMouseUp: (event: TuiMouseEvent) => {
      if (event.button !== MouseButton.LEFT) return;
      event.stopPropagation();
      if (historySnapshot().pressed !== id) return;
      setHistoryPressed(null);
      if (!event.isDragging) action();
    },
  });
  const label = seriesHeading(position, commits.length, width, range) + (history.hasMore ? "+" : "");
  const spinner = ["◐", "◓", "◑", "◒"][frame];
  const status = anchor ? " End · Esc" : pending ? ` ${spinner} Loading comparison` : history.loading ? ` ${spinner} Refreshing history` : history.error ? ` ${history.error}`
    : history.newCommits > 0 ? ` ${history.newCommits} new · click to view`
    : snapshot.commit && position === null ? " Commit outside scope"
    : ` Scope: ${history.scope}`;

  return (
    <box style={{ width, height, overflow: "hidden", backgroundColor: theme.panel, flexDirection: "column" }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: theme.panel }}>
        <text id="history-heading" wrapMode="none" selectable={false} fg={theme.muted}
          style={{ width, height: 1, flexShrink: 0 }}>{clip(label, width)}</text>
      </box>
      <text id="history-status" wrapMode="none" selectable={false} fg={anchor || history.error ? theme.text : theme.muted}
        style={{ width, height: 1, flexShrink: 0 }}
        {...handlers("new", () => {
          if (history.newCommits > 0 && !anchor && commits.at(-1)) {
            cancel(); acknowledgeNewCommits(); requestCommit(commits.at(-1)!.sha, actions.notify, session);
          }
        })}>{clip(status, width)}</text>
      {(["staged", "unstaged"] as const).map((kind) => {
        const active = pending?.kind === "working" ? pending.value === kind : !pending && snapshot.review?.endsWith(kind === "staged" ? " staged changes" : " working tree");
        const background = active ? theme.selectedHunk : hovered === kind ? theme.accentMuted : theme.panelAlt;
        const tone = kind === "staged" ? theme.badgeAdded : theme.fileModified;
        return <box key={kind} id={`review-${kind}`} style={{ height: 1, flexShrink: 0, width, flexDirection: "row", backgroundColor: background }}
          {...handlers(kind, () => { cancel(); requestWorking(kind, actions.notify, session); })}>
          <text selectable={false} fg={tone} bg={background} style={{ width: 3, height: 1 }}>{active ? "▸" : " "}{kind === "staged" ? "S " : "W "}</text>
          <text selectable={false} fg={theme.text} bg={background} style={{ flexGrow: 1, height: 1 }}><b>{kind === "staged" ? "Staged" : "Unstaged"}</b></text>
          <text selectable={false} fg={tone} bg={background} style={{ height: 1 }}>{history[kind]} </text>
        </box>;
      })}
      <scrollbox id="history-scroll" ref={scroll} focused={false} scrollY={true}
        style={{ flexGrow: 1, backgroundColor: theme.panel }}
        rootOptions={{ backgroundColor: theme.panel }} wrapperOptions={{ backgroundColor: theme.panel }}
        viewportOptions={{ backgroundColor: theme.panel }} contentOptions={{ backgroundColor: theme.panel }}
        verticalScrollbarOptions={{ visible: false }} horizontalScrollbarOptions={{ visible: false }}>
        {start > 0 && <box style={{ height: start, flexShrink: 0 }} />}
        {commits.slice(start, end).map((commit, local) => {
          const index = start + local;
          const selected = isSelectedIndex(painted, index);
          const background = anchor === commit.sha ? theme.accentMuted : selected ? theme.selectedHunk
            : hovered === commit.sha ? theme.panelAlt : theme.panel;
          return <box key={commit.sha} id={`commit-log-row-${index}`}
            style={{ height: 1, flexShrink: 0, width: "100%", backgroundColor: background }}
            {...handlers(commit.sha, () => choose(commit.sha))}>
            <text wrapMode="none" selectable={false}
              fg={hovered === commit.sha && selected ? theme.accent : theme.text} bg={background}>
              {commitRow(commit, width, { active: index === painted.position, selected })}
            </text>
          </box>;
        })}
        {end < commits.length && <box style={{ height: commits.length - end, flexShrink: 0 }} />}
        {commits.length === 0 && <text fg={theme.muted}>{history.loading ? " Loading history…" : " No commits in scope"}</text>}
      </scrollbox>
      <text id="load-older" selectable={false} truncate wrapMode="none"
        fg={history.hasMore ? theme.accent : theme.muted}
        bg={hovered === "older" && history.hasMore ? theme.accentMuted : theme.panelAlt}
        style={{ width, height: 1, flexShrink: 0 }}
        {...handlers("older", () => { if (history.hasMore && !history.loading) onMore?.(); })}>
        {history.loading ? ` ${spinner} Loading history` : history.hasMore ? " ↑ Load older commits" : ` All ${commits.length} loaded`}
      </text>
    </box>
  );
}

/**
 * What the reviewed commit says, above the diff it produced.
 *
 * Hunk builds a revision review with `git show --format=`, so the message is
 * the one thing about the commit that the review itself never shows.
 */
/** Tones name theme roles, so a theme switch repaints without touching this. */
function toneColor(theme: ExtensionPaneProps["theme"], tone: Tone): string {
  switch (tone) {
    case "accent":
      return theme.accent;
    case "accentMuted":
      return theme.accentMuted;
    case "muted":
      return theme.muted;
    default:
      return theme.text;
  }
}

export function MessagePane({ width, height, theme }: ExtensionPaneProps): ReactNode {
  const { commits, position, message, commit } = useSyncExternalStore(subscribeSeries, seriesSnapshot);
  const head = commit ?? (position === null ? undefined : commits[position]);
  const rows = head === undefined || message === null ? [] : messageRows(head, message, Math.max(0, width - 1));
  const renderRow = (row: (typeof rows)[number], index: number) => <text key={index} bg={theme.panel} style={{ height: 1, flexShrink: 0 }}>
    {row.map((segment, part) => <span key={part} fg={toneColor(theme, segment.tone)} bg={theme.panel}>{segment.text}</span>)}
  </text>;
  return <box style={{ width, height, overflow: "hidden", backgroundColor: theme.panel, flexDirection: "column" }}>
    {rows.slice(0, 2).map(renderRow)}
    <scrollbox key={head?.sha} id="commit-body-scroll" scrollY focused={false}
      style={{ width, height: Math.max(0, height - 2), backgroundColor: theme.panel }}
      rootOptions={{ backgroundColor: theme.panel }} wrapperOptions={{ backgroundColor: theme.panel }}
      viewportOptions={{ backgroundColor: theme.panel }} contentOptions={{ backgroundColor: theme.panel }}
      verticalScrollbarOptions={{ visible: rows.length > height }} horizontalScrollbarOptions={{ visible: false }}>
      {rows.slice(2).map(renderRow)}
    </scrollbox>
  </box>;
}
