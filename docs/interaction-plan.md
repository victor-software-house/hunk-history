# Commit review interaction

## Operator decisions

- Double-click either endpoint to arm a range. The next commit click closes and immediately
  applies the inclusive range, in either direction. Escape cancels. No extra Apply step.
- Preserve the accepted `h` Files/Commits switch. Keep this extension-only.
- Remove the ellipsis/menu path: its divider-adjacent hit target and press/release behavior were
  rejected in the real host. Mocked modal answers did not test that integration.
- Keep one header row and full-width non-wrapping rows. The left-aligned `[Files]` button has
  explicit hover paint and stays away from the divider. Only an armed range shows a short hint.
- Commit and push for review, but do not bump or publish until final-shape approval. Any later
  authorized bump is at most patch. Keep version 0.0.1 unchanged.

## Implementation

- Wait 300 ms before single-click navigation so the first half of a double-click cannot reload.
  Only completed left clicks count; dragging cannot arm or apply a range.
- Highlight the anchor and show `End · Esc` until the next click. Equal endpoints load one commit.
- Escape, pane unmount and replacement of the review cancel pending click timers and drafts.
- Preserve requested-versus-loaded range semantics. A failed request leaves loaded state intact.
- Commits defaults to 34 columns (22 minimum). The switch closes the previous pane before opening
  the next. Other host commands are not intercepted. Message-pane behavior is unchanged.
- Scope is available through the Show commit review scope command, not permanent chrome.

## Proof

Run `npm run typecheck`, `npm test` and `git diff --check`. OpenTUI pointer tests exercise both
endpoint orders, equal endpoints, release persistence, Escape, single-click timing, scrolling,
drag rejection, failed loads and hover feedback. Node tests retain state and request-queue proof.

Verify the actual Hunk host before claiming the interaction works there. Automated component
checks alone cannot establish host hit targets or pointer dispatch. Final shape approval remains
with the operator. No dependencies or alternate UI framework are added.
