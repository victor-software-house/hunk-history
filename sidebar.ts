import type { ExtensionPaneControls } from "hunkdiff/extension";

export const SIDEBAR_PANE = "browser";
export type SidebarTab = "files" | "history";

/** One sidebar owns tab selection and independent scroll memory. */
export function createSidebar() {
  let tab: SidebarTab = "history";
  let filesScroll = 0;
  let selectedFile: string | null = null;
  const listeners = new Set<() => void>();
  function publish(next: SidebarTab) {
    if (tab === next) return;
    tab = next;
    for (const listener of listeners) listener();
  }
  function show(panes: ExtensionPaneControls, next: SidebarTab): void {
    publish(next);
    panes.open(SIDEBAR_PANE);
  }
  return {
    show,
    toggleTab() { publish(tab === "files" ? "history" : "files"); },
    toggleSidebar(panes: ExtensionPaneControls) { panes.toggle(SIDEBAR_PANE); },
    getTab: () => tab,
    selectTab: publish,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSelectedFile: () => selectedFile,
    rememberSelectedFile(id: string | null) { selectedFile = id; },
    getFilesScroll: () => filesScroll,
    rememberFilesScroll(top: number) { filesScroll = top; },
  };
}
export type SidebarController = ReturnType<typeof createSidebar>;
