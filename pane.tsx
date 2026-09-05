import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  MouseButton,
  type MouseEvent as TuiMouseEvent,
  type ScrollBoxRenderable,
} from "@opentui/core";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { messageRows, type Tone } from "./highlight.ts";
import { clip, commitRow, seriesHeading } from "./row.ts";
import { pendingRange, requestCommit, requestRange, type SessionDeps } from "./session.ts";
import { isSelectedIndex, selectedRange, seriesSnapshot, subscribeSeries } from "./store.ts";

function rowId(index: number): string {
  return `commit-log-row-${index}`;
}

/** Single-commit navigation stays separate from an explicitly applied range. */
export function CommitLogPane({
  actions,
  width,
  height,
  theme,
  session,
}: ExtensionPaneProps & { session?: SessionDeps }): ReactNode {
  const snapshot = useSyncExternalStore(subscribeSeries, seriesSnapshot);
  const { commits, position, range } = snapshot;
  const scroll = useRef<ScrollBoxRenderable | null>(null);
  const [startSha, setStartSha] = useState<string | null>(null);
  const [endSha, setEndSha] = useState<string | null>(null);
  const start = commits.findIndex((commit) => commit.sha === startSha);
  const end = commits.findIndex((commit) => commit.sha === endSha);

  const apply = () => {
    if (start < 0 || end < 0) {
      actions.notify("Choose Start and End commits before applying a range", "info");
      return;
    }
    if (start === end) {
      requestCommit(commits[start]!.sha, actions.notify, session);
      return;
    }
    const selection = selectedRange(snapshot, start, end);
    if (selection === null) {
      actions.notify("Cannot resolve the selected commit range", "warning");
      return;
    }
    requestRange(selection, actions.notify, session);
  };

  const clear = () => {
    setStartSha(null);
    setEndSha(null);
    const commit = position === null ? undefined : commits[position];
    if ((range !== null || pendingRange() !== null) && commit)
      requestCommit(commit.sha, actions.notify, session);
  };

  useEffect(() => {
    if (position !== null) scroll.current?.scrollChildIntoView(rowId(position));
  }, [position, commits]);

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
      <text
        style={{ height: 1, flexShrink: 0 }}
        selectable={false}
        fg={theme.accent}
        bg={theme.panel}
      >
        {seriesHeading(position, commits.length, width, range)}
      </text>
      <text style={{ height: 1, flexShrink: 0 }} selectable={false} fg={theme.muted}>
        {clip(` Scope: ${snapshot.scope ?? "opened commit"}`, width)}
      </text>
      <text
        style={{ height: 1, flexShrink: 0 }}
        selectable={false}
      >{` Start: ${commits[start]?.abbrev ?? "not set"}`}</text>
      <text
        style={{ height: 1, flexShrink: 0 }}
        selectable={false}
      >{` End:   ${commits[end]?.abbrev ?? "not set"}`}</text>
      <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
        <text
          id="range-apply"
          selectable={false}
          fg={theme.accent}
          onMouseDown={(event: TuiMouseEvent) => {
            if (event.button !== MouseButton.LEFT) return;
            event.stopPropagation();
            apply();
          }}
        >
          {" "}
          [Apply]{" "}
        </text>
        <text
          id="range-clear"
          selectable={false}
          onMouseDown={(event: TuiMouseEvent) => {
            if (event.button !== MouseButton.LEFT) return;
            event.stopPropagation();
            clear();
          }}
        >
          {" "}
          [Clear]{" "}
        </text>
      </box>
      <scrollbox
        ref={scroll}
        focused={false}
        scrollY={true}
        style={{ flexGrow: 1, backgroundColor: theme.panel }}
        rootOptions={{ backgroundColor: theme.panel }}
        wrapperOptions={{ backgroundColor: theme.panel }}
        viewportOptions={{ backgroundColor: theme.panel }}
        contentOptions={{ backgroundColor: theme.panel }}
        verticalScrollbarOptions={{ visible: false }}
        horizontalScrollbarOptions={{ visible: false }}
      >
        {commits.map((commit, index) => (
          <box
            key={commit.sha}
            id={rowId(index)}
            style={{ flexDirection: "row", height: 1, flexShrink: 0 }}
          >
            <text
              id={`range-start-${index}`}
              selectable={false}
              fg={start === index ? theme.accent : theme.muted}
              onMouseDown={(event: TuiMouseEvent) => {
                if (event.button !== MouseButton.LEFT) return;
                event.stopPropagation();
                setStartSha(commit.sha);
              }}
            >
              [Start]
            </text>
            <text
              id={`range-end-${index}`}
              selectable={false}
              fg={end === index ? theme.accent : theme.muted}
              onMouseDown={(event: TuiMouseEvent) => {
                if (event.button !== MouseButton.LEFT) return;
                event.stopPropagation();
                setEndSha(commit.sha);
              }}
            >
              [End]
            </text>
            <text
              id={`commit-open-${index}`}
              selectable={false}
              fg={isSelectedIndex(snapshot, index) ? theme.text : theme.muted}
              bg={isSelectedIndex(snapshot, index) ? theme.selectedHunk : theme.panel}
              onMouseDown={(event: TuiMouseEvent) => {
                if (event.button !== MouseButton.LEFT) return;
                event.stopPropagation();
                if (range !== null || position !== index)
                  requestCommit(commit.sha, actions.notify, session);
              }}
            >
              {commitRow(commit, Math.max(0, width - 12), {
                active: index === position,
                selected: isSelectedIndex(snapshot, index),
              })}
            </text>
          </box>
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
