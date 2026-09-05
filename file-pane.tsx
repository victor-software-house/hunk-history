import { useEffect, useMemo, useRef, useState } from "react";
import { useRenderer } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import type { SidebarController } from "./sidebar.ts";
import { buildFlatSidebarEntries, buildTreeSidebarEntries, resolveFileSidebarMode, sidebarEntryStatsWidth } from "./vendor/hunk/files.ts";
import { FileDirectoryRow, FileGroupHeader, FileListItem } from "./vendor/hunk/FileListItem.tsx";

/** Window the native file projection inside an independently remembered scrollbox. */
export function FilePane({ files, selectedFileId, actions, theme, width, height, sidebar }: ExtensionPaneProps & { sidebar: SidebarController }) {
  const scroll = useRef<ScrollBoxRenderable | null>(null);
  const renderer = useRenderer();
  const [offset, setOffset] = useState(sidebar.getFilesScroll());
  const textWidth = Math.max(8, width - 2);
  const mode = resolveFileSidebarMode(textWidth);
  const entries = useMemo(() => mode === "tree" ? buildTreeSidebarEntries(files) : buildFlatSidebarEntries(files), [files, mode]);
  const selectedRow = entries.findIndex((entry) => entry.kind === "file" && entry.id === selectedFileId);
  const statsWidth = entries.reduce((maximum, entry) => entry.kind === "file" ? Math.max(maximum, sidebarEntryStatsWidth(entry)) : maximum, 0);
  useEffect(() => {
    const view = scroll.current;
    if (!view) return;
    let active = true;
    let restored = false;
    const update = () => {
      if (!active || view.viewport.height <= 0) return;
      if (!restored) { view.scrollTop = sidebar.getFilesScroll(); restored = true; }
      sidebar.rememberFilesScroll(view.scrollTop);
      setOffset(view.scrollTop);
    };
    const layout = () => { queueMicrotask(update); };
    renderer.root.on("layout-changed", layout);
    view.verticalScrollBar.on("change", update);
    layout();
    return () => { active = false; renderer.root.off("layout-changed", layout); view.verticalScrollBar.off("change", update); };
  }, [sidebar, renderer]);
  useEffect(() => {
    const view = scroll.current;
    if (!view || selectedFileId === sidebar.getSelectedFile()) return;
    sidebar.rememberSelectedFile(selectedFileId);
    if (selectedRow >= 0) {
      const top = sidebar.getFilesScroll();
      const next = selectedRow < top ? selectedRow : selectedRow >= top + height ? selectedRow - height + 1 : top;
      sidebar.rememberFilesScroll(Math.max(0, next));
      view.scrollTop = Math.max(0, next);
      setOffset(Math.max(0, next));
    }
  }, [selectedFileId, selectedRow, height, sidebar]);
  const start = Math.max(0, Math.min(entries.length - 1, Math.floor(offset) - 8));
  const end = Math.min(entries.length, start + height + 16);
  return <scrollbox id="files-scroll" ref={scroll} scrollY focused={false}
    style={{ width, height, backgroundColor: theme.panel }}
    verticalScrollbarOptions={{ visible: entries.length > height }} horizontalScrollbarOptions={{ visible: false }}>
    {start > 0 && <box style={{ height: start, flexShrink: 0 }} />}
    {entries.slice(start, end).map((entry) => entry.kind === "group"
      ? <FileGroupHeader key={entry.id} entry={entry} textWidth={textWidth} theme={theme} />
      : entry.kind === "directory"
        ? <FileDirectoryRow key={entry.id} entry={entry} paddingLeft={0} statsWidth={statsWidth} textWidth={textWidth} theme={theme} />
        : <FileListItem key={entry.id} entry={entry} paddingLeft={mode === "tree" ? 0 : 1} selected={entry.id === selectedFileId}
          statsWidth={statsWidth} textWidth={textWidth} theme={theme} onSelectFile={actions.selectFile} />)}
    {end < entries.length && <box style={{ height: entries.length - end, flexShrink: 0 }} />}
    {entries.length === 0 && <text fg={theme.muted}> No files in this comparison</text>}
  </scrollbox>;
}
