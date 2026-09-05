import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { MouseButton, type MouseEvent as TuiMouseEvent, type ScrollBoxRenderable } from "@opentui/core";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { messageRows, type Tone } from "./highlight.ts";
import { commitRow, seriesHeading } from "./row.ts";
import { requestCommit, type SessionDeps } from "./session.ts";
import { isSelectedIndex, seriesSnapshot, subscribeSeries } from "./store.ts";

export interface CommitLogPaneProps extends ExtensionPaneProps {
  session?: SessionDeps;
  onFiles(): void;
  onActions(sha: string): void;
}

function rowId(index: number): string {
  return `commit-log-row-${index}`;
}

export function CommitLogPane({ actions, width, height, theme, session, onFiles, onActions }: CommitLogPaneProps): ReactNode {
  const snapshot = useSyncExternalStore(subscribeSeries, seriesSnapshot);
  const { commits, position, range } = snapshot;
  const scroll = useRef<ScrollBoxRenderable | null>(null);

  useEffect(() => {
    if (position !== null) scroll.current?.scrollChildIntoView(rowId(position));
  }, [position, commits]);

  return (
    <box style={{ width, height, overflow: "hidden", backgroundColor: theme.panel, flexDirection: "column" }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: theme.panel }}>
        <text wrapMode="none" selectable={false} fg={theme.muted} bg={theme.panel}
          style={{ width: Math.max(0, width - 9), height: 1, flexShrink: 0 }}>
          {seriesHeading(position, commits.length, Math.max(0, width - 9), range)}
        </text>
        <text id="show-files" wrapMode="none" selectable={false} fg={theme.muted} bg={theme.panel}
          style={{ width: 6, flexShrink: 0 }}
          onMouseDown={(event: TuiMouseEvent) => {
            if (event.button !== MouseButton.LEFT) return;
            event.stopPropagation();
            onFiles();
          }}>{"Files "}</text>
        <text id="range-actions" wrapMode="none" selectable={false} fg={theme.muted} bg={theme.panel}
          style={{ width: 3, flexShrink: 0 }}
          onMouseDown={(event: TuiMouseEvent) => {
            if (event.button !== MouseButton.LEFT) return;
            event.stopPropagation();
            const commit = position === null ? undefined : commits[position];
            if (commit) onActions(commit.sha);
          }}>{" ⋯ "}</text>
      </box>
      <scrollbox ref={scroll} focused={false} scrollY={true}
        style={{ flexGrow: 1, backgroundColor: theme.panel }}
        rootOptions={{ backgroundColor: theme.panel }} wrapperOptions={{ backgroundColor: theme.panel }}
        viewportOptions={{ backgroundColor: theme.panel }} contentOptions={{ backgroundColor: theme.panel }}
        verticalScrollbarOptions={{ visible: false }} horizontalScrollbarOptions={{ visible: false }}>
        {commits.map((commit, index) => (
          <text key={commit.sha} id={rowId(index)} wrapMode="none" selectable={false}
            style={{ height: 1, flexShrink: 0, width: "100%" }}
            fg={theme.text} bg={isSelectedIndex(snapshot, index) ? theme.selectedHunk : theme.panel}
            onMouseDown={(event: TuiMouseEvent) => {
              if (event.button !== MouseButton.LEFT && event.button !== MouseButton.RIGHT) return;
              event.stopPropagation();
              if (event.button === MouseButton.RIGHT) onActions(commit.sha);
              else if (range !== null || position !== index) requestCommit(commit.sha, actions.notify, session);
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
