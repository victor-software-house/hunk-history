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

## Binding models

### A. Snapshot identity — record the revision and comparison in the anchor

- Mechanism: attach a comparison record to the saved note — kind (`commit`, `range`,
  `staged`, `unstaged`, `all`), base, tip or SHA, and repository root — and expose it in the
  snapshot and `hunk session comment list`. Resolution compares the note's recorded
  comparison with the loaded one and reports `active`, `stale`, or `restorable`; reloading
  the recorded comparison restores the note.
- Fixes: attribution, deterministic restore, and the provenance every other model needs.
- Still breaks: it does not add persistence, so a comment still dies with the session. It
  does not survive a rename inside the current comparison, because the note stays bound to
  the old path-derived file key.
- Migration: existing notes have no comparison field, treated as unknown provenance.
- Size: Hunk core, multi-file, plus a release. The retired fork makes this expensive.

### B. Git rename following — resolve the path forward through renames

- Mechanism: when a note's path is absent, map it forward with `git diff -M --name-status`,
  `git log --follow`, or content-blob matching, then re-anchor at the mapped path and range.
- Fixes: comments survive pure renames inside a tracked repository.
- Still breaks: it needs the base revision to diff from, which the note does not record, so
  it needs A or a guess. There is no public note-write API, so re-binding is remove plus add,
  which changes the id, author, and timestamps. Content edits defeat rename detection or
  shift lines, identical content in two paths is ambiguous, and a comment dropped from the
  store cannot be followed at all.
- Migration: re-add every recoverable note at its resolved path, losing ids.
- Size: extension-only, medium, heuristic.

### C. External addressability — a durable, repo-scoped comment ledger

- Mechanism: the extension owns an append-only ledger keyed by a stable id, recording each
  comment's provenance and a content hash. Hunk keeps rendering live comments. The
  extension writes an entry when it observes a comment through `note_changed`, and exposes
  `hunk history comments --repo <path>` so an operator or agent can list a repository's
  comments without a session id. Re-materialization maps a ledger entry into a live session
  through the existing `hunk session comment add`.
- Fixes: durability across session end, reachability across comparison and path changes,
  external addressability without a session id, and a home for the provenance A lacks. It
  subsumes A's data and uses B's rename following only as a bounded re-anchor hint.
- Still breaks: it is a second store, so it needs an explicit reversal of the standing
  ownership decision. Hunk's live note and the ledger can drift. A content hash alone is not
  a key, so entries key on a stable id and keep the comparison, path, and blob hash as
  re-anchor hints.
- Migration: import existing live notes as they are observed; no bulk rewrite.
- Size: extension-only, medium, no core change.

### D. Stable comparisons — pin base and head instead of a moving working state

- Mechanism: keep the window on a fixed comparison loaded through the session CLI
  (`requestCommit` / `requestRange` / `requestWorking`, already shipped).
- Fixes: nothing breaks while the window stays pinned.
- Still breaks: it avoids the trigger instead of curing it, and it is incompatible with the
  history browser that is this extension's purpose. It records nothing, so nothing is
  reachable later.
- Migration: none.
- Size: zero, already shipped.

## Decision

Recommend **C. External addressability**.

The operator's requirement is reachability a week later without remembering a session id.
Hunk 0.21.1 persists no comment and the fork is retired, so A cannot deliver that on its own
and B and D cannot either. C is the only model the extension can ship against the official
upstream that delivers it, and it absorbs A (snapshot identity) as its provenance and B
(rename following) as a bounded re-anchor hint.

Dead ends as standalone fixes:

- **A** needs a Hunk-core change in a retired fork and still loses comments on session end.
- **B** has no note-write API and needs the base revision A would add; it mis-anchors silently.
- **D** is not a fix; it asks the operator to stop browsing history, which is the feature that
  exposes the defect.

Chosen-model caveat: C is a second store. The standing decision in
[extension-capabilities.md](extension-capabilities.md) forbids a parallel comment store
without a separate product decision. The question below is that decision.

## Implementation slices, if authorized

1. Durable ledger writer. On `note_changed` (created, updated, removed) and for session
   comments, append to an append-only log at
   `~/.local/share/hunk-history/comments/<repo-hash>.jsonl` (XDG, not inside the user's
   repository, to avoid the host workspace-write guard). Entry: stable id, `repoRoot`,
   `noteId`, `source`, `author`, `createdAt`, `updatedAt`, `filePath`, `side`, `hunkIndex`,
   `oldRange`, `newRange`, body, `capturedAt`, `capturedHead` (`git rev-parse HEAD`), and
   `capturedTarget` when the extension knows the loaded comparison, else null. No UI.
2. `hunk history comments --repo <path> [--file <path>] [--json]`. A registered extension
   CLI command that lists ledger entries and marks each entry live, stale, or absent against
   the current session and working tree.
3. Re-materialize. Resolve a ledger entry to a current file and line by exact path first,
   then by recorded blob hash and rename following, and `hunk session comment add` into a
   live session. Mark the entry re-anchored. This is the only place B is used.
4. Reconcile on startup and surface a status row. Optional.

## Verification, once implemented

1. Comment on a commit comparison, move the file within the repository, and confirm the
   comment still resolves to the re-anchored file and line.
2. Comment, change the comparison to another commit, return, and confirm the comment is
   present both times.
3. Comment on a range, extend the range, and confirm the comment is not silently attached to
   a different change.
4. Comment against staged changes, commit them, and confirm the comment follows into the
   commit.
5. Confirm an agent can list and resolve comments for a repository without a session id.
6. Unit-test the ledger writer and reader on a throwaway repository, including remove,
   update, and a rename that only blob-hash matching can follow.

## Operator question

Authorize the extension to own a durable, repository-scoped comment ledger — a second
comment store — given that Hunk 0.21.1 does not persist comments and the fork is retired?

- **Yes** — implement slices 1-4.
- **No** — the only Hunk-owned option is an upstream core change (model A), and "reachable a
  week later" stays unmet; keep model D as the workaround.
