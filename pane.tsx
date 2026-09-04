import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
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
  cancelRangeSelection,
  isSelectedIndex,
  publishRange,
  selectedRange,
  seriesSnapshot,
  subscribeSeries,
} from "./store.ts";

/** Row ids are what `scrollChildIntoView` addresses, so they must be stable. */
function rowId(index: number): string {
  return `commit-log-row-${index}`;
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
  const { commits, position, range, rangeAnchor } = snapshot;
  const rangeMode = rangeAnchor !== null;
  const scroll = useRef<ScrollBoxRenderable | null>(null);

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
        {seriesHeading(position, commits.length, width, range, rangeMode)}
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
          const active = index === position;
          const selected = isSelectedIndex(snapshot, index);
          return (
            <text
              key={commit.sha}
              id={rowId(index)}
              fg={selected ? theme.text : theme.muted}
              bg={selected ? (rangeMode ? theme.accentMuted : theme.selectedHunk) : theme.panel}
              onMouseDown={(event: TuiMouseEvent) => {
                if (event.button !== MouseButton.LEFT) {
                  return;
                }
                event.stopPropagation();

                if (rangeMode) {
                  const nextRange = selectedRange(snapshot, index);
                  if (nextRange !== null) {
                    requestRange(nextRange.revisionRange, actions.notify, () =>
                      publishRange(nextRange),
                    );
                    return;
                  }

                  cancelRangeSelection();
                  if (range !== null) {
                    requestCommit(commit.sha, actions.notify);
                  }
                  return;
                }

                if (!active) {
                  requestCommit(commit.sha, actions.notify);
                }
              }}
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
