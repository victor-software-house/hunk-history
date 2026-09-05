import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MouseButton, type MouseEvent as TuiMouseEvent, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { messageRows, type Tone } from "./highlight.ts";
import { commitRow, seriesHeading, clip } from "./row.ts";
import { pendingReview, subscribePending, requestCommit, requestRange, requestWorking, type SessionDeps } from "./session.ts";
import { isSelectedIndex, selectedRange, remapRange, seriesSnapshot, subscribeSeries } from "./store.ts";
import { historySnapshot, subscribeHistory, acknowledgeNewCommits, setHistoryGesture, rememberHistoryScroll, setHistoryPressed } from "./history.ts";

export interface CommitLogPaneProps extends ExtensionPaneProps {
  session?: SessionDeps;
  onFiles(): void;
  onMore?(): void;
}

const DOUBLE_CLICK_MS = 300;

export function CommitLogPane({ actions, width, height, theme, session, onFiles, onMore }: CommitLogPaneProps): ReactNode {
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
  const previousRows = useRef({ commits, older: history.hasMore });
  const loadedSha = snapshot.commit?.sha ?? commits[position ?? -1]?.sha;

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
      if (!active) return;
      if (restore > 0) {
        if (view.viewport.height === 0 || view.scrollHeight <= view.viewport.height) return;
        const target = restore;
        restore = 0;
        view.scrollTop = target;
      }
      setOffset(view.scrollTop);
      rememberHistoryScroll(view.scrollTop);
    };
    const afterLayout = () => { queueMicrotask(update); };
    view.verticalScrollBar.on("change", update);
    renderer.root.on("layout-changed", afterLayout);
    update();
    return () => {
      active = false;
      view.verticalScrollBar.off("change", update);
      renderer.root.off("layout-changed", afterLayout);
    };
  }, []);
  useEffect(() => {
    const view = scroll.current;
    if (!view) return;
    const old = previousRows.current;
    if (old.commits === commits && old.older === history.hasMore) return;
    const first = old.commits[Math.max(0, Math.floor(view.scrollTop) - (old.older ? 1 : 0))];
    const index = first ? commits.findIndex((row) => row.sha === first.sha) : -1;
    if (old.commits !== commits && index >= 0) {
      view.scrollTop += index - old.commits.indexOf(first!) + Number(history.hasMore) - Number(old.older);
    }
    previousRows.current = { commits, older: history.hasMore };
    setOffset(view.scrollTop);
  }, [commits, history.hasMore]);
  useEffect(() => {
    const view = scroll.current;
    const index = commits.findIndex((row) => row.sha === loadedSha);
    if (!view || index < 0) return;
    const row = index + (history.hasMore ? 1 : 0);
    const visible = Math.max(1, height - 4);
    if (row < view.scrollTop) view.scrollTop = row;
    else if (row >= view.scrollTop + visible) view.scrollTop = row - visible + 1;
    setOffset(view.scrollTop);
    rememberHistoryScroll(view.scrollTop);
  }, [loadedSha]);

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
  const label = seriesHeading(position, commits.length, width - 7, range) + (history.hasMore ? "+" : "");
  const status = anchor ? " End · Esc" : pending ? " Loading" : history.error ? ` ${history.error}`
    : history.newCommits > 0 ? ` ${history.newCommits} new · click to view`
    : snapshot.commit && position === null ? " Commit outside scope"
    : ` Scope: ${history.scope}`;

  return (
    <box style={{ width, height, overflow: "hidden", backgroundColor: theme.panel, flexDirection: "column" }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: theme.panel }}>
        <text id="show-files" wrapMode="none" selectable={false}
          fg={hovered === "files" ? theme.text : theme.muted}
          bg={hovered === "files" ? theme.accentMuted : theme.panelAlt}
          style={{ width: 7, height: 1, flexShrink: 0 }}
          {...handlers("files", () => { cancel(); onFiles(); })}>{"[Files]"}</text>
        <text id="history-heading" wrapMode="none" selectable={false} fg={theme.muted}
          style={{ width: Math.max(0, width - 7), height: 1, flexShrink: 0 }}>{clip(label, width - 7)}</text>
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
        const background = active ? theme.selectedHunk : hovered === kind ? theme.panelAlt : theme.panel;
        return <text key={kind} id={`review-${kind}`} wrapMode="none" selectable={false}
          fg={theme.text} bg={background} style={{ height: 1, flexShrink: 0 }}
          {...handlers(kind, () => { cancel(); requestWorking(kind, actions.notify, session); })}>
          {clip(` ${active ? "▸" : " "} ${kind === "staged" ? "Staged" : "Unstaged"} ${history[kind]}`, width)}
        </text>;
      })}
      <scrollbox id="history-scroll" ref={scroll} focused={false} scrollY={true}
        style={{ flexGrow: 1, backgroundColor: theme.panel }}
        rootOptions={{ backgroundColor: theme.panel }} wrapperOptions={{ backgroundColor: theme.panel }}
        viewportOptions={{ backgroundColor: theme.panel }} contentOptions={{ backgroundColor: theme.panel }}
        verticalScrollbarOptions={{ visible: false }} horizontalScrollbarOptions={{ visible: false }}>
        {history.hasMore && <text id="load-older" selectable={false} fg={theme.muted}
          style={{ height: 1, flexShrink: 0 }} {...handlers("older", () => { if (!history.loading) onMore?.(); })}>
          {history.loading ? " Loading older…" : " Load older…"}
        </text>}
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
  const rows =
    head === undefined || message === null ? [] : messageRows(head, message, width, height);

  return (
    <box
      style={{
        width,
        height,
        overflow: "hidden",
        backgroundColor: theme.panel,
        flexDirection: "column",
      }}
    >
      {rows.map((row, index) => (
        <text key={`message-${index}`} bg={theme.panel}>
          {row.map((segment, part) => (
            <span key={`segment-${part}`} fg={toneColor(theme, segment.tone)} bg={theme.panel}>
              {segment.text}
            </span>
          ))}
        </text>
      ))}
    </box>
  );
}
