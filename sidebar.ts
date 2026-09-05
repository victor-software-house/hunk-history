import type { ExtensionPaneControls } from "hunkdiff/extension";

/** One review runtime remembers which pane History temporarily replaced. */
export function createSidebar() {
  let restoreFiles = false;

  function show(panes: ExtensionPaneControls, view: "files" | "commits"): void {
    if (view === "commits") {
      if (!panes.isOpen("commits")) restoreFiles = panes.isOpen("hunk:files");
      panes.close("hunk:files");
      panes.open("commits");
    } else {
      restoreFiles = false;
      panes.close("commits");
      panes.open("hunk:files");
    }
  }

  function toggleHistory(panes: ExtensionPaneControls): void {
    if (!panes.isOpen("commits")) {
      show(panes, "commits");
      return;
    }
    panes.close("commits");
    if (restoreFiles) panes.open("hunk:files");
    restoreFiles = false;
  }

  /** Files' shortcut must not bypass the history pane's exclusion rule. */
  function toggleFiles(panes: ExtensionPaneControls): void {
    restoreFiles = false;
    panes.close("commits");
    panes.toggle("hunk:files");
  }

  return { show, toggleHistory, toggleFiles };
}
