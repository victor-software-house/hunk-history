# Comment anchoring

Status: decision pending. The chosen model is recommended, not implemented. Every change
on this branch is committed and pushed.

## Purpose

A Hunk comment is written while looking at a comparison. It must stay attributable to the
revision it was written against, survive rewrites, splits, and moves, and stay reachable
later. This document records the verified record shape, the binding models, and the chosen
model with its implementation slices. Implementation waits on the operator's decision.

## Problem

A comment records a file path and a line anchor and nothing that identifies the comparison
it was written against. When the path or the comparison changes, nothing re-binds the
comment and `hunk session navigate --comment` stops resolving it. The comment is
effectively lost and the operator repeats the review.

## Verified record shape

The record has two shapes. Neither carries a commit, a comparison identity, or a session
identity. Evidence is the fork source at `~/workspace/victor/fork-mirror/hunk` (branch
`main`, checked out 2026-08-07) and the installed `hunkdiff 0.21.1` bundle.

Live comment — `hunk session comment list --type live`; `src/session/types.ts:109-119`:

| Field | Notes |
|---|---|
| `commentId` | required |
| `filePath` | required |
| `hunkIndex` | required |
| `side`, `line` | `old` or `new`, one positive line |
| `summary`, `rationale?`, `author?`, `createdAt` | text and metadata |

Review note — `--type all\|ai\|agent\|user`; `src/session/types.ts:121-134`:

| Field | Notes |
|---|---|
| `noteId` | required |
| `source` | `ai`, `agent`, or `user` |
| `filePath` | required |
| `hunkIndex?`, `oldRange?`, `newRange?` | anchor |
| `body`, `title?`, `author?` | text and metadata |
| `createdAt`, `updatedAt?`, `editable` | metadata |

The store-side records are `LiveComment` (`src/core/liveComments.ts:18-30`) and
`UserReviewNote` (`src/ui/hooks/useReviewController.ts:113-124`). Both extend
`AgentAnnotation` (`src/extension-api/types.ts:82-96`), which adds only optional
`oldRange`, `newRange`, `title`, `author`, `createdAt`, `updatedAt`, `editable`, `markup`,
`tags`, and `confidence`. The two CLI summaries are projected from these at
`src/ui/hooks/useReviewController.ts:1160-1188`. The only field that crosses the boundary
with any identity is the path; the anchor is line coordinates inside one document.

### Can the review store carry a revision or generation anchor?

- Git revision or comparison: no. No field on the note, the anchor, the session state
  (`src/session/types.ts:54-68`), or the wire summary names a commit, a base, a tip, or a
  comparison kind.
- Store generation and state revision: partially, in the installed build only.
  `hunk session get --json` reports
  `snapshot.state.reviewPublication: { generation, stateRevision }`. Both are store-scoped:
  the generation changes on reload and the revision counts review-store mutations. Neither
  is a Git SHA, and the fork source has no such field.

### Extension API snapshot identity

The extension type surface (`hunkdiff/extension`, `ExtensionReviewSnapshot` at
`dist/npm/extension/extension-api/types.d.ts:1391-1406`) exposes an opaque
`generation: string` (`:1397`), a store-scoped `stateRevision: number` (`:1399`),
reviewed files carrying `fileKey` — "stable semantic address within this review"
(`:1338`) — plus optional `contentIdentity`/`sourceIdentity`, and notes whose `anchor`
carries `oldRange`, `newRange`, `preferred`, `intersectingHunkIndices`, and
`ownerHunkIndex` (`:1366-1371`). This extension reads none of it today; it tracks the
comparison it requested through its own `pendingReview`/`seriesSnapshot` state.

The anchor already rides on the snapshot's `fileKey`, not on a bare path. That does not
make it durable: in the shipped implementation `fileKey` is
`digest(sourceLabel, path, previousPath, duplicateIndex)` and `contentIdentity` hashes the
path as well, so a rename or a comparison change changes both, and `generation` changes on
reload. Snapshot identity scopes a note inside one review; it cannot replace a durable
anchor.

### What survives a path or comparison change

| Item | Survives? |
|---|---|
| `body`, `author`, ids, timestamps | yes, plain data |
| `filePath` binding | no; the store keys notes by a path-derived file key |
| `hunkIndex`, `newRange`, `oldRange` | no; they index the comparison that was loaded |
| comparison attribution | no field exists |
| reachability after the session ends | no; the installed build writes no comment file to disk |

No shipped code path writes review-store notes or comments to disk; the file writes found
serve daemon launch metadata, lock and security files, extension-mediated workspace files,
and unrelated caches. A comment is session-scoped and ephemeral.

## Observed failure, 2026-09-11

Against hunk-history 0.0.5 and installed `hunkdiff` 0.21.1:

- A session whose commented files are still part of its comparison resolves its comments.
  `hunk session comment list --type live` returns them and
  `hunk session navigate --comment <id>` returns the file and line.
- After the commented file was moved out of the comparison, the same session reported
  `liveCommentCount: 0` and `reviewNoteCount: 0`; `navigate --comment` answered
  "No live comment" for every comment at every commit tested, including the commit the
  comment was written against.
- The comment text survived only while the comparison stayed unchanged. Where a comment was
  recovered by hand it appears as an agent comment authored by `restored-operator-note`
  whose body quotes the original text.

This is observation, not a reproduced test. The record-shape section is code-verified.

