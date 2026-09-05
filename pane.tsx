import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MouseButton, type MouseEvent as TuiMouseEvent, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { messageRows, type Tone } from "./highlight.ts";
import { commitRow, seriesHeading } from "./row.ts";
import { requestCommit, requestRange, type SessionDeps } from "./session.ts";
import { isSelectedIndex, selectedRange, seriesSnapshot, subscribeSeries } from "./store.ts";

export interface CommitLogPaneProps extends ExtensionPaneProps {
  session?: SessionDeps;
  onFiles(): void;
}

const DOUBLE_CLICK_MS = 300;

function rowId(index: number): string {
  return `commit-log-row-${index}`;
}

export function CommitLogPane({ actions, width, height, theme, session, onFiles }: CommitLogPaneProps): ReactNode {
  const snapshot = useSyncExternalStore(subscribeSeries, seriesSnapshot);
  const { commits, position, range } = snapshot;
  const scroll = useRef<ScrollBoxRenderable | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [filesHovered, setFilesHovered] = useState(false);
  const pressed = useRef<string | null>(null);
  const click = useRef<{ sha: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const cancelClick = () => {
    if (click.current) clearTimeout(click.current.timer);
    click.current = null;
  };

  useEffect(() => {
    setAnchor(null);
    pressed.current = null;
    return cancelClick;
  }, [snapshot]);

  useKeyboard((key) => {
    if (key.name !== "escape" || (anchor === null && click.current === null)) return;
    key.stopPropagation();
    cancelClick();
    setAnchor(null);
  });

  const choose = (sha: string) => {
    if (anchor !== null) {
      cancelClick();
      const start = commits.findIndex((commit) => commit.sha === anchor);
      const end = commits.findIndex((commit) => commit.sha === sha);
      setAnchor(null);
      if (start === end) requestCommit(sha, actions.notify, session);
      else {
        const selection = selectedRange(snapshot, start, end);
        if (selection) requestRange(selection, actions.notify, session);
      }
      return;
    }
    if (click.current?.sha === sha) {
      cancelClick();
      setAnchor(sha);
      return;
    }
    cancelClick();
    click.current = { sha, timer: setTimeout(() => {
      click.current = null;
      if (seriesSnapshot() !== snapshot) return;
      if (range !== null || commits[position ?? -1]?.sha !== sha)
        requestCommit(sha, actions.notify, session);
    }, DOUBLE_CLICK_MS) };
  };

  useEffect(() => {
    if (position !== null) scroll.current?.scrollChildIntoView(rowId(position));
  }, [position, commits]);

  return (
    <box style={{ width, height, overflow: "hidden", backgroundColor: theme.panel, flexDirection: "column" }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: theme.panel }}>
        <text id="show-files" wrapMode="none" selectable={false}
          fg={filesHovered ? theme.text : theme.muted}
          bg={filesHovered ? theme.accentMuted : theme.panelAlt}
          style={{ width: 7, height: 1, flexShrink: 0 }}
          onMouseOver={() => setFilesHovered(true)} onMouseOut={() => setFilesHovered(false)}
          onMouseDown={(event: TuiMouseEvent) => {
            if (event.button !== MouseButton.LEFT) return;
            event.stopPropagation();
            pressed.current = "files";
          }}
          onMouseUp={(event: TuiMouseEvent) => {
            event.stopPropagation();
            if (event.button !== MouseButton.LEFT || pressed.current !== "files") return;
            pressed.current = null;
            cancelClick();
            setAnchor(null);
            onFiles();
          }}>{"[Files]"}</text>
        <text wrapMode="none" selectable={false} fg={anchor ? theme.text : theme.muted} bg={theme.panel}
          style={{ width: Math.max(0, width - 9), height: 1, flexShrink: 0 }}>
          {anchor ? " End · Esc" : seriesHeading(position, commits.length, Math.max(0, width - 9), range)}
        </text>
      </box>
      <scrollbox ref={scroll} focused={false} scrollY={true}
        style={{ flexGrow: 1, backgroundColor: theme.panel }}
        rootOptions={{ backgroundColor: theme.panel }} wrapperOptions={{ backgroundColor: theme.panel }}
        viewportOptions={{ backgroundColor: theme.panel }} contentOptions={{ backgroundColor: theme.panel }}
        verticalScrollbarOptions={{ visible: false }} horizontalScrollbarOptions={{ visible: false }}>
        {commits.map((commit, index) => (
          <text key={commit.sha} id={rowId(index)} wrapMode="none" selectable={false}
            style={{ height: 1, flexShrink: 0, width: "100%" }}
            fg={theme.text} bg={anchor === commit.sha ? theme.accentMuted : isSelectedIndex(snapshot, index) ? theme.selectedHunk : theme.panel}
            onMouseDown={(event: TuiMouseEvent) => {
              if (event.button !== MouseButton.LEFT) return;
              event.stopPropagation();
              event.preventDefault();
              pressed.current = commit.sha;
            }}
            onMouseDrag={() => { pressed.current = null; cancelClick(); }}
            onMouseUp={(event: TuiMouseEvent) => {
              if (event.button !== MouseButton.LEFT) return;
              event.stopPropagation();
              if (pressed.current !== commit.sha) return;
              pressed.current = null;
              if (!event.isDragging) choose(commit.sha);
            }}>
            {commitRow(commit, width, { active: index === position, selected: isSelectedIndex(snapshot, index) })}
          </text>
        ))}
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
  const { commits, position, message } = useSyncExternalStore(subscribeSeries, seriesSnapshot);
  const head = position === null ? undefined : commits[position];
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
