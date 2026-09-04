import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  MouseButton,
  type MouseEvent as TuiMouseEvent,
  type ScrollBoxRenderable,
} from "@opentui/core";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { messageRows, type Tone } from "./highlight.ts";
import { commitRow, seriesHeading } from "./row.ts";
import { requestCommit, requestRange } from "./session.ts";
import {
  isSelectedIndex,
  publishRange,
  selectedRange,
  seriesSnapshot,
  subscribeSeries,
} from "./store.ts";

/** Row ids are what `scrollChildIntoView` and drag hit-testing address. */
function rowId(index: number): string {
  return `commit-log-row-${index}`;
}

/** Resolve the commit row currently under a mouse event. */
function eventRowIndex(event: TuiMouseEvent, fallback: number): number {
  const match = /^commit-log-row-(\d+)$/.exec(event.target?.id ?? "");
  return match === null ? fallback : Number(match[1]);
}

interface DragSelection {
  anchor: number;
  endpoint: number;
}

/**
 * The commit series behind the review, oldest at the top.
 *
 * Deliberately not newest-first the way a history list usually reads: the
 * position in the review header counts from the oldest commit, and so will the
 * stepping keys, so the rows count the same way. Reading down the pane is
 * reading the branch forwards.
 */
export function CommitLogPane({ actions, width, height, theme }: ExtensionPaneProps): ReactNode {
  const snapshot = useSyncExternalStore(subscribeSeries, seriesSnapshot);
  const { commits, position, range } = snapshot;
  const scroll = useRef<ScrollBoxRenderable | null>(null);
  const dragRef = useRef<DragSelection | null>(null);
  const [drag, setDrag] = useState<DragSelection | null>(null);

  /** Keep event-time drag state available before React's next render. */
  const updateDrag = (next: DragSelection | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  /** Complete one click or drag without leaving a persistent selection mode. */
  const finishSelection = (event: TuiMouseEvent, fallback: number) => {
    const current = dragRef.current;
    if (current === null || event.button !== MouseButton.LEFT) {
      return;
    }

    event.stopPropagation();
    const endpoint = eventRowIndex(event, fallback);
    updateDrag(null);
    const nextRange = selectedRange(snapshot, current.anchor, endpoint);
    if (nextRange !== null) {
      requestRange(nextRange.revisionRange, actions.notify, () => publishRange(nextRange));
      return;
    }

    const commit = commits[endpoint];
    if (commit && (range !== null || endpoint !== position)) {
      requestCommit(commit.sha, actions.notify);
    }
  };

  const previewRange =
    drag === null
      ? range
      : { start: Math.min(drag.anchor, drag.endpoint), end: Math.max(drag.anchor, drag.endpoint) };

  useEffect(() => {
    if (position !== null) {
      scroll.current?.scrollChildIntoView(rowId(position));
    }
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
      <text fg={theme.accent} bg={theme.panel}>
        {seriesHeading(position, commits.length, width, previewRange, drag !== null)}
      </text>
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
        {commits.map((commit, index) => {
          const selected =
            drag === null
              ? isSelectedIndex(snapshot, index)
              : index >= Math.min(drag.anchor, drag.endpoint) &&
                index <= Math.max(drag.anchor, drag.endpoint);
          const active = drag === null ? index === position : index === drag.endpoint;
          const rangeVisible = drag !== null || range !== null;
          return (
            <text
              key={commit.sha}
              id={rowId(index)}
              fg={selected ? theme.text : theme.muted}
              bg={selected ? (rangeVisible ? theme.accentMuted : theme.selectedHunk) : theme.panel}
              onMouseDown={(event: TuiMouseEvent) => {
                if (event.button !== MouseButton.LEFT) {
                  return;
                }
                event.stopPropagation();
                updateDrag({ anchor: index, endpoint: index });
              }}
              onMouseDrag={(event: TuiMouseEvent) => {
                const current = dragRef.current;
                if (current === null) {
                  return;
                }
                event.stopPropagation();
                updateDrag({ ...current, endpoint: eventRowIndex(event, index) });
              }}
              onMouseDragEnd={(event: TuiMouseEvent) => finishSelection(event, index)}
              onMouseUp={(event: TuiMouseEvent) => finishSelection(event, index)}
            >
              {commitRow(commit, width, { active, selected })}
            </text>
          );
        })}
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
