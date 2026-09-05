# Live history trial

## User decisions

- Implement the analysed direction immediately with a short plan.
- Make capabilities discoverable to coding agents using Hunk's supported surfaces.
- Do not bump the version or release until the user has live-tested and approved.
- Preserve double-click to start a range. Single clicks must dispatch immediately. Do not add a Range control or replace the gesture with unusual key combinations; those approaches were already rejected.

## Trial choices (agent implementation choices, pending live approval)

- Single clicks request immediately, including the first click of a double-click. A second click on the same SHA arms the range; the next endpoint click applies it. Preserve double-click recognition and the armed anchor across completion of that first request. Escape cancels. No extra range control or new key combination.
- Keep one Files/Commits sidebar. Staged and Unstaged remain selectable above history.
- Default browsing follows HEAD independently of the selected review. Configured ranges remain explicit; the scope chooser offers branch history, configured scope and pinned history.
- Page older commits without a total-history cap; batch Git metadata asynchronously and window rendered rows.
- Reconcile new commits without changing a pinned diff or range. Moving comparisons through HEAD or working tree are explicit actions.
- Hunk's installed API has named UI commands but no extension agent-instruction or session-command registration. Bundle a README-linked agent guide using existing session reload/context/review commands; do not pretend UI commands are model-callable.

## Trial evidence

- Typecheck and diff whitespace checks pass.
- 76 Node tests and 16 rendered OpenTUI tests pass, including real Git polling,
  bursts larger than a page, linked worktrees, stale scope responses, full App
  remounts between clicks and between press/release, and preserved working-state
  scroll position.
- Installed Hunk 0.21.0 was launched in a separate session-only PTY with the checkout
  passed via `--extension`. Pointer input loaded commit `80ead21`, preserved the
  double-click anchor across the real App remount, then applied the range
  `80ead21…6b932fa`. Staged loaded an empty comparison and Unstaged loaded the
  working diff without losing the history sidebar.
- The installed release entry remains byte-identical to the original 0.0.2 source.
  Both manifests still report 0.0.2; no installed files, version, tag or release
  were changed.
- The bundled agent skill validates and the README links it. Hunk does not inject
  it into model context: an agent must read it or its operator must register it
  with the agent's skill loader.

Operator live testing and approval are still outstanding. Automated tests and a
separate PTY smoke do not approve the interaction direction on the operator's behalf.

## Steps and proof

1. Async history and independent refresh, stable SHA selection, staged/unstaged counts → real Git fixtures including new commits, scope, pagination and index changes.
2. Immediate clicks, preserved double-click range selection, compact source/scope controls and windowed rows → rendered pointer tests covering the first request finishing before/between/after the double-click and endpoint, plus pending/failure behavior.
3. Integrate lifecycle, commands, live comparisons and agent guide → registration tests, typecheck, complete suite, clean diff.
4. Provide checkout-based live test invocation; preserve installed release → version remains 0.0.2 and user live approval remains outstanding.

Expected files: series.ts, store.ts, session.ts, index.ts, pane.tsx, tests, README.md, docs/interaction-plan.md and a bundled skills/hunk-history/SKILL.md. A history controller may own polling and scope reconciliation so React and lifecycle handlers share one state path.

Non-goals: staging mutations, host changes, new dependencies, new services, package-manager migration, release, automatic replacement of installed files. Existing message layout and Files exclusion stay intact.
