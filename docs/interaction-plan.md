# Commit review interaction

## Current operator decisions

- Single clicks must load immediately. Preserve double-click to arm a range, then
  one endpoint click to apply it. Do not add a Range button, modifier gesture or
  separate Apply step. Earlier control-heavy approaches were rejected.
- The first click of a double-click may start loading its commit. Its completion
  must not erase double-click recognition or the armed range.
- Preserve the accepted `h` Files/Commits switch and explicit exclusive `s` override.
- Support live history, new commits, and selectable staged/unstaged reviews without
  replacing a pinned review or cluttering the interface.
- Make supported operations discoverable to coding agents. Published Hunk supports
  top-level extension CLI trees and saved-note monitoring/snapshots. It does not
  inject model instructions or support extension-defined `hunk session` subcommands.
- The operator live-tested and approved the interaction. Comment display is fine;
  the follow-up concerns programmatic agent behavior, not a comment-isolation redesign.
- Update the official Hunk host, SDK and all development dependencies (including
  TypeScript) to latest stable. Use the official upstream, never the retired local
  Hunk fork. See [the capability audit](extension-capabilities.md).
- **Version remains 0.0.2 pending a separate release action.** Live approval has been
  granted; it is no longer an outstanding interaction gate.

## Implementation

- A single click dispatches immediately. The 300 ms interval only recognizes a
  second click; it never delays dispatch. Equal range endpoints load one commit.
- Hunk daemon reloads remount the entire App. Click identity and the armed SHA live
  in the external store, not component-local state. Own reloads preserve them.
- Escape, Files/Commits switches, scope/repository changes and external review
  replacement cancel gestures. Pointer drags never select commits or ranges.
- Loaded and requested reviews stay separate. A failed request restores loaded
  paint, and the existing request queue serializes/coalesces bursts.
- History is independently refreshed, asynchronously paged, and window-rendered.
  Exact range endpoint SHAs survive row-index changes. Working-state reviews do
  not erase history. Staged and Unstaged are two rows, not new toolbars.
- Scope and live-comparison actions live in the existing Extensions menu. New-commit
  feedback uses the existing header. Message-pane sizing remains unchanged.

## Proof and approval gate

Run `npm run typecheck`, `npm test`, and `git diff --check`. Tests cover real Git
history/index changes, pagination, explicit scopes, immediate clicks, both endpoint
orders, response timing, full-pane remounts, Escape, scrolling, drag rejection,
hover continuity and failures.

Also exercise the actual installed Hunk binary with `--extension` pointing to the
checkout. Component tests alone previously missed full App remounts. A session-only
PTY smoke caught that difference during this trial; it is now a regression test.
Do not equate automated smoke evidence with operator approval of the UI.

[Live-history plan](live-history-plan.md) · [Agent guide](../skills/hunk-history/SKILL.md).
