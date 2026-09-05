# Commit review interaction

## Operator decisions

- Double-click either endpoint to arm a range. The next commit click closes and immediately
  applies the inclusive range, in either direction. Escape cancels. No extra Apply step.
- Preserve the accepted `h` Files/Commits switch. Keep this extension-only.
- Remove the ellipsis/menu path: its divider-adjacent hit target and press/release behavior were
  rejected in the real host. Mocked modal answers did not test that integration.
- Keep one header row and full-width non-wrapping rows. The left-aligned `[Files]` button has
  explicit hover paint and stays away from the divider. Only an armed range shows a short hint.
- Final shape approved. Release 0.0.2 as a Git tag and GitHub release; retain Git-based
  installation. No npm publication or new release infrastructure is authorized.
  Future releases require explicit approval.

## Implementation

- Wait 300 ms before single-click navigation so the first half of a double-click cannot reload.
  Only completed left clicks count; dragging cannot arm or apply a range.
- Highlight the anchor and show `End · Esc` until the next click. Equal endpoints load one commit.
- Escape, pane unmount and replacement of the review cancel pending click timers and drafts.
- Preserve requested-versus-loaded range semantics. A failed request leaves loaded state intact.
- Commits defaults to 34 columns (22 minimum). The switch closes the previous pane before opening
  the next. Other host commands are not intercepted. Message-pane behavior is unchanged.
- Scope is available through the Show commit review scope command, not permanent chrome.
- Single clicks paint immediately with `Opening`; requested reviews paint with `Loading`.
  These previews never change loaded state. Selected row backgrounds stay continuous on hover.
- Bind `s` to `hunk-history.files` and disable the native Files shortcut as documented in the
  README. Both `h` and `s` then close the other view before opening a pane.

## Proof

Run `npm run typecheck`, `npm test` and `git diff --check`. OpenTUI pointer tests exercise both
endpoint orders, equal endpoints, release persistence, Escape, single-click timing, scrolling,
drag rejection, failed loads and hover feedback. Node tests retain state and request-queue proof.

Verify the actual Hunk host before claiming the interaction works there. Automated component
checks alone cannot establish host hit targets or pointer dispatch. The operator has approved
the final shape and the 0.0.2 patch release. No dependencies or alternate UI framework are added.

Live host verification: terminal mouse press/release sequences armed a range without loading,
kept the hint visible after release, applied newest-to-oldest 1–5 and oldest-to-newest 1–3,
and cancelled with Escape. The Files button switched views on release; `h` returned to Commits.
The original single-commit review was restored afterwards. Subsequent live checks verified
immediate single-click feedback, contiguous range backgrounds, and exclusive `h`/`s` switching.
The release gate is typecheck, 81 Node tests and ten rendered tests.
