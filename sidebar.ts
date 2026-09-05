import type { ExtensionPaneControls } from "hunkdiff/extension";

/** Swap views; never reserve a second sidebar column for history. */
export function showSidebar(panes: ExtensionPaneControls, view: "files" | "commits"): void {
  if (view === "commits") {
    panes.close("hunk:files");
    panes.open("commits");
  } else {
    panes.close("commits");
    panes.open("hunk:files");
  }
}
