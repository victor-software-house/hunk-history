# Commit review interaction

## Approved work

Replace drag/Shift-dependent range selection with explicit Start/End controls and Apply/Clear.
Keep single-commit clicks and next/previous navigation. Show the configured review scope; do not
silently replace an invalid configured range with unrelated history. Failed range loads must leave
the loaded selection and message unchanged. Verify actual rendered pointer interaction as well as
store and CLI behavior.

## Release gate

Operator decision: push the implementation for final-shape review, but do not bump the version or
publish until explicitly approved. Any approved bump is at most patch. Keep version 0.0.1 unchanged.

## Implementation and proof

- Replace pane drag handlers with per-row Start/End buttons, visible endpoints, and Apply/Clear.
- Keep a requested range separate from loaded state; commit it only when Hunk loads its exact diff.
- Make unconfigured recent history explicit and stable across pushes; configured scope failures
  remain visible and restrict the pane to the opened commit rather than silently broadening scope.
- Use existing OpenTUI test renderer for real pointer events; retain Node unit/typecheck gates.
- No new dependencies, generic UI framework, or changes to Hunk itself.

## Verification

`npm run typecheck` and `npm test` pass: 79 Node unit tests and four rendered OpenTUI pointer
scenarios. The rendered gate caught overlapping headers under a long list; fixed header rows now
remain visible while the list scrolls. It also covers Clear during an in-flight Apply. Node cannot
initialize this OpenTUI native renderer, so only the rendered shard uses Bun; package installation
remains npm. The previous module-mock and compilation experiments were removed.

Final interactive shape approval is still pending. Tests do not substitute for that approval.
