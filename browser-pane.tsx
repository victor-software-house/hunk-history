import { useRef, useState, useSyncExternalStore } from "react";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import { CommitLogPane } from "./pane.tsx";
import { FilePane } from "./file-pane.tsx";
import type { SidebarController, SidebarTab } from "./sidebar.ts";
import { cancelHistoryGesture } from "./history.ts";

/** One host-owned rectangle, two local views; changing tabs never reloads the diff. */
export function BrowserPane(props: ExtensionPaneProps & { sidebar: SidebarController; onMore(): void }) {
  const { sidebar, width, height, theme } = props;
  const tab = useSyncExternalStore(sidebar.subscribe, sidebar.getTab);
  const [hovered, setHovered] = useState<SidebarTab | null>(null);
  const pressed = useRef<SidebarTab | null>(null);
  return <box style={{ width, height, backgroundColor: theme.panel, flexDirection: "column" }}>
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      {(["files", "history"] as const).map((view, index) => <text key={view} id={`tab-${view}`} selectable={false} truncate wrapMode="none"
        fg={tab === view ? theme.accent : hovered === view ? theme.text : theme.muted}
        bg={hovered === view ? theme.accentMuted : tab === view ? theme.panelAlt : theme.panel}
        style={{ width: index === 0 ? Math.floor(width / 2) : width - Math.floor(width / 2), height: 1 }}
        onMouseOver={() => setHovered(view)} onMouseOut={() => setHovered(null)}
        onMouseDown={(event) => { if (event.button === 0) { event.stopPropagation(); pressed.current = view; } }}
        onMouseUp={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          if (pressed.current === view && !event.isDragging) { cancelHistoryGesture(); sidebar.selectTab(view); }
          pressed.current = null;
        }}><b>{tab === view ? " ▸ " : "   "}{view === "files" ? "Files" : "History"}</b></text>)}
    </box>
    {tab === "files" ? <FilePane {...props} height={Math.max(0, height - 1)} />
      : <CommitLogPane {...props} height={Math.max(0, height - 1)} />}
  </box>;
}
