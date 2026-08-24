import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { commitRow, seriesHeading } from "./row.ts";
import { requestCommit } from "./session.ts";
import { seriesSnapshot, subscribeSeries } from "./store.ts";

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
  const { commits, position } = useSyncExternalStore(subscribeSeries, seriesSnapshot);
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
        {seriesHeading(position, commits.length, width)}
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
        {commits.map((commit, index) => (
          <text
            key={commit.sha}
            id={rowId(index)}
            fg={index === position ? theme.text : theme.muted}
            bg={index === position ? theme.selectedHunk : theme.panel}
            onMouseDown={
              index === position ? undefined : () => requestCommit(commit.sha, actions.notify)
            }
          >
            {commitRow(commit, width, index === position)}
          </text>
        ))}
      </scrollbox>
    </box>
  );
}
