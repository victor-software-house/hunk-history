# Commit review interaction

## Operator decisions

- Preserve explicit Start/End and Apply/Clear logic, single-commit clicks and next/previous
  navigation. Failed loads must retain the loaded selection and message.
- The first functional form was rejected: repeated row buttons and five header rows waste space.
  Use a single themed header, full-width non-wrapping rows and contextual controls instead.
- Keep the correction extension-only. Hunk has no shared-sidebar tab contribution API; swap
  Files and Commits rather than changing the host or copying its file tree.
- Commit and push for review, but do not bump or publish until final-shape approval. Any later
  authorized bump is at most patch. Keep version 0.0.1 unchanged.

## Implementation

- Commits defaults to 34 columns (22 minimum), matching Hunk's standard sidebar sizing.
- `h` swaps Files and Commits; the Files header affordance returns to the host file tree.
  Close the previous pane before opening the next. Start in Commits only for a commit review.
  Other host commands can still explicitly open panes; this extension does not intercept them.
- Right-click a row or use the header's `⋯` / command palette for Hunk's native selector.
  Endpoint hashes, Apply/Clear and scope are contextual, not permanent pane chrome.
- Use the event bus for fresh review-generation controls; do not retain dialog contexts.
  Cancelled or stale menu answers do not modify the draft.
- Requested and loaded ranges remain separate. Publish a range only after its matching diff loads.
- Invalid configured ranges warn and restrict the series to the opened commit, never unrelated
  history. Message-pane behavior is unchanged.

## Proof

Run `npm run typecheck`, `npm test` and `git diff --check`. Node covers state, CLI, menu
cancellation/staleness, endpoint rules and pane swap ordering. Bun's existing OpenTUI renderer
covers actual pointer dispatch, one-row chrome, full-width list rows, scrolling and queued Clear
while Apply is pending. No dependencies or new UI framework are added.

Final live visual review is required; automated tests do not approve the shape.
