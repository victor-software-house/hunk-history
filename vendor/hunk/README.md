# Native Hunk file navigation

Vendored from official [modem-dev/hunk](https://github.com/modem-dev/hunk/tree/622c0a363724ec20eeec6c392cc3058e3aacec52), commit `622c0a363724ec20eeec6c392cc3058e3aacec52`, under the accompanying MIT license.

Sources:
- `src/ui/lib/files.ts`: ordered flat/tree projection, rename labels and stats.
- `src/ui/components/panes/FileListItem.tsx`: directory/file rows, status colors and stats alignment.
- `src/core/changeset/diffPaths.ts` and `src/lib/terminalText.ts`: path normalization/escaping.

Local adaptations:
- Use the public `hunkdiff/extension` file/change/theme contracts. Remove unrelated file-header and annotation mutation helpers and internal metadata fallback.
- Use OpenTUI native text truncation instead of importing the host's general text engine and its dependency graph.
- Namespace row ids; add hover feedback and ignore right-click/drag selection.
- Paint selection with a themed `▌` half-block rather than a solid cell, preserving the one-column gutter and filename alignment.
- Scrolling, windowing, tab state and host navigation actions belong to the extension's surrounding component.

This is an explicitly maintained native-navigation copy, not a fork of the Hunk application. Compare these exact upstream files when updating; preserve review order, tree/flat behavior, rename/untracked status, stats, active-theme colors and terminal-safe paths. No diff renderer or comment store is vendored.
