# Commit review interaction

## Current operator decisions

- The operator approved the complete tabbed sidebar for release 0.0.4. Working-state
  letters must match Files status styling: plain colored `S`/`W`, without brackets
  that suggest keyboard shortcuts. Full-width tab backgrounds and the half-cell
  selected-file marker are included.

- Single clicks must load immediately. Preserve double-click to arm a range, then
  one endpoint click to apply it. Do not add a Range button, modifier gesture or
  separate Apply step. Earlier control-heavy approaches were rejected.
- The first click of a double-click may start loading its commit. Its completion
  must not erase double-click recognition or the armed range.
- Final tabbed-sidebar contract: `s` toggles the entire sidebar and preserves its
  active tab; `h` switches Files/History only, preserving visibility. This supersedes
  the prior separate-pane Files-restoration behavior.
- The operator requested this bounded correction within 0.0.3: move its existing
  tag after verification instead of bumping. Layout redesign is separate follow-up.
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
- The operator approved release and installation of **0.0.3**, including the
  live-approved interaction and runtime instruction discovery. Existing review
  windows must not be closed or their notes discarded as part of installation.

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
  feedback uses a stable status row; pagination is fixed outside the scroller.

## Approved tabbed-sidebar direction

- Own one pane replacing `hunk:files`, with Files/History tabs, hover feedback,
  immediate switching and independent scroll memory. No Hunk application fork.
- Vendor native file navigation with attribution and a pinned upstream source;
  keep host file selection, diff rendering and comment ownership intact.
- Keep the final s=visibility / h=tabs contract and accepted commit/range gestures. Tab changes cancel
  armed gestures without replacing the comparison.
- Distinguish staged/unstaged with themed badges. Show loading progress and explicit
  all-loaded pagination state instead of hiding the explanation.
- Commit bodies scroll at the chosen height. Do not change the selected message
  pane id automatically on commit changes; this preserves Hunk's dragged height.
- This redesign remains a source trial pending operator visual approval.

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
