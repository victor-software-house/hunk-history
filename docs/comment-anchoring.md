# Comment anchoring

Status: open. Workstream document for this branch. Annotate in place; every change is
committed.

## Purpose

A Hunk comment is written while looking at a comparison. It must stay attributable to the
revision it was written against, survive rewrites, splits, and moves, and stay reachable
later. This branch carries the diagnosis and the design for that.

## The problem in one paragraph

The operator places comments on the visible commit selection or range. Today a comment
carries a file path and a line anchor and nothing that identifies the comparison it belongs
to. When the path leaves the displayed comparison, the comment stops resolving and nothing
re-binds it, so the comment is effectively lost and the operator has to repeat themselves.
Recovery has so far been manual.

## What a comment is today

Fields exposed by `hunk session comment list --type all --json`:

| Field | Meaning |
|---|---|
| `noteId` | `user:<epoch-ms>-<n>` for a person, `mcp:<uuid>` for an agent |
| `source` | `user` or `agent` |
| `filePath` | the file the comment sits on |
| `hunkIndex` | which hunk of that file |
| `newRange` | line range on the new side |
| `body` | the text |
| `author`, `createdAt`, `updatedAt`, `editable` | metadata |

No commit, no revision range, no snapshot identity.

Hunk's extension notes describe the review snapshot as carrying stable file keys, anchors,
a generation, and a state revision. The generation and the state revision belong to the
review store, not to Git history.

## Observed behaviour, 2026-09-11

Against the published extension build in use at the time (hunk-history 0.0.5, Hunk
`hunkdiff` 0.21.1):

- A session whose commented files are still part of its comparison resolves its comments:
  `hunk session comment list --type live` returns them and
  `hunk session navigate --comment <id>` returns the file and line.
- After the commented file was moved out of the comparison, the same session reported
  `liveCommentCount: 0` and `reviewNoteCount: 0`; `navigate --comment` answered
  "No live comment" for every comment at every commit tested, including the commit the
  comment was written against.
- The comment text survived in the session store while the comparison stayed unchanged, and
  in Git history afterwards.
- Where a comment was recovered by hand, it appears as an agent-authored comment whose
  author is `restored-operator-note` and whose body quotes the original text.

## What already exists around this

- The history pane keeps commits addressable and can hold a comparison open: one commit, a
  range, staged, unstaged, or a pinned base with a live tip (`through-head`,
  `through-worktree`).
- `docs/extension-capabilities.md` records the standing decision: Hunk owns comments, and
  per-commit isolation or a parallel comment store is not to be introduced without a
  separate product decision. This document is part of reaching that decision.
- The core fork (`victor-software-house/hunk`, PR #1, branch `feat/selectable-diff-range`)
  added process-owned review tabs with independent project and range state and a bounded
  History range selection. The installed binary is upstream `hunkdiff` 0.21.1, where
  `hunk session tab` does not exist.

## Candidate designs

1. **Store the comparison with the comment.** Record the snapshot identity (commit, or
   base and tip, or staged/unstaged) alongside the file path and anchor. Resolution then
   happens against that snapshot first, and against the display only when they agree.
2. **Resolve through Git path history.** When a path is absent from the comparison, follow
   renames and content identity to find its descendant, and re-anchor the comment to the
   same line range there.
3. **Make the comment addressable from outside a session.** A comment reachable by
   repository plus file plus revision, so an agent can list and act on comments without
   depending on which comparison a window happens to display.
4. **Nothing in Hunk; make the window stable.** Keep the comparison fixed and set it up
   deliberately through the session CLI, accepting that comments do not survive a move.

## Open questions

1. Which of the four is the actual fix, or which combination?
2. Does a comment belong to the snapshot it was written against, or to the file across
   history, or both, with the snapshot as provenance?
3. Where should a comment live so the operator can find it a week later without
   remembering a session id: the repository, the workstream note, or a query over sessions?
4. What has to stay inside Hunk core, and what can an extension own without a second
   comment store?

## Test plan, once a direction is chosen

1. Write a comment on a commit comparison, move the file within the repo, and check that
   the comment still resolves, listing the re-anchored file and line.
2. Write a comment, change the comparison to a different commit, then return, and check
   that the comment is present both times.
3. Write a comment on a range, extend the range, and check that the comment is not silently
   attached to a different change.
4. Write a comment against staged changes, commit them, and check whether it follows into
   the commit.
5. Verify that an agent can list and resolve comments for a repository without knowing a
   session id.
