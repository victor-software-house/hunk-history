# hunk-history

Review Git history one commit at a time or apply an explicit inclusive range in
[Hunk](https://hunk.dev). The commit list sits beside the diff, with the commit
message above it. This project builds on
[Sadick Mwakio's hunk-commit-log](https://github.com/sadick254/hunk-commit-log).

Requires Hunk 0.19.0 or newer (extension API 6) and Git on PATH.

## Review controls

- **Click a commit's SHA/subject** to review only that commit. **n / p** move
  to the next/previous commit without wrapping.
- **Files / Commits:** press **h** to swap the two views in one sidebar area.
  The **Files** label in the commit header switches back to Hunk's file tree.
  This is an extension-only switch, not native tabs. Commits defaults to 34 columns.
- **Range actions:** right-click a commit, click **⋯** for the active commit, or
  use the **Commit range actions** command. Hunk owns the themed modal and Escape.
- **Start here / End here** set draft endpoints without loading a diff. Their
  hashes appear in the menu title, not in permanent fields above the list.
- **Apply** appears when both endpoints exist. Either order works; equal
  endpoints load one commit.
- **Clear range** removes draft endpoints and returns an applied or pending
  range to the active loaded commit.

No dragging, Shift-click, or persistent selection mode is required. Applied
ranges are labeled separately from draft endpoints. Failed loads retain the
previously loaded selection and message rather than claiming the new range loaded.

The commit header shows its position in the series, SHA and subject. The message
pane shows the author, full timestamp with original UTC offset, and wrapped body.
Theme roles distinguish identifiers, metadata and prose.

Initialize with a single-commit review:

```sh
hunk show HEAD
```

Unrelated `hunk diff`, stash and patch reviews remain inert. An inclusive range
selected from the commit pane keeps that series available for single-commit review.

## Install

```sh
hunk extension install victor-software-house/hunk-history
```

Or try the checkout without installing it:

```sh
hunk show HEAD --extension /path/to/hunk-history
```

The extension id and configuration namespace are `hunk-history`.

## Review scope

The **Show scope** menu action identifies which commits the list represents. For a branch
review, set a range explicitly in the repository's `.hunk/config.toml`:

```toml
[extension.hunk-history]
range = "origin/main..HEAD"
messageRows = 8
```

The series is exactly that Git revision range, ordered oldest first. Open a
commit inside it. An unavailable range or one excluding the opened commit shows
an operator warning and only that commit; it never silently broadens to unrelated
history. Leading-dash ranges are ignored rather than passed as Git options.

Without a configured range, the series is the most recent `limit` commits ending
at the opened commit, explicitly labeled `recent N through SHA`. This does not
change when a branch is pushed. `limit` defaults to 20 and is clamped to 1–500;
it does not truncate an explicitly configured range.

```toml
[extension.hunk-history]
limit = 20
messageRows = 8
```

The series stays fixed while stepping within it. Opening a commit outside it
resolves another series. Configuration is read when the extension starts; restart
Hunk after changing it.

## Keys and message layout

| Key | Command id | Action |
|:--|:--|:--|
| `n` | `hunk-history.next` | Next commit |
| `p` | `hunk-history.previous` | Previous commit |
| `h` | `hunk-history.toggle` | Switch Files / Commits |
| `i` | `hunk-history.message` | Toggle commit message |
| `I` | `hunk-history.expand` | Fit/collapse message |
| — | `hunk-history.range` | Commit range actions |

Remap command ids in the user config's `[keybindings]` table. `[` and `]` already
belong to Hunk's hunk navigation and are not claimed by this extension.

`messageRows` sets the initial message height (3–60 rows). Drag its divider to
resize it. `I` chooses the smallest available height among 8, 12, 18, 26, 36 and
50 rows; longer messages report omitted lines. The message pane has no scrolling.

## Boundaries

- A selected range compares the oldest selected commit's parent (or Git's empty
  tree for a root commit) with the newest selected commit. It is a **net tree
  diff**, not concatenated commit patches. Merge topology can include effects
  not represented by a simple linear list of highlighted rows.
- Hunk's review title supplies the reviewed ref; the extension API does not
  expose it directly. Only Git repositories are supported.
- Loading uses the Hunk session daemon, locating this window by PID. Requests
  serialize and bursts coalesce. A failed reload clears cached session discovery
  for the next user action; it does not automatically replay a failed request.
- On narrow terminals Hunk can hide the side pane rather than squeeze the diff.
  Widen the window to recover it.

## Development and approval

```sh
npm install
npm run typecheck
npm test
```

Node runs pure unit tests. The rendered pointer tests use the existing OpenTUI
in-memory renderer under Bun (tested with Bun 1.4.0); OpenTUI's current native FFI
is not available under Node. No second package manager or new dependency is added.
The pointer tests exercise the compact header, full-width rows, Files affordance,
menu dispatch, Apply/Clear, single-commit clicks, release outside the list, and
scrolling through the production request queue, with the Hunk CLI and modal-answer
seams injected. Direct tests cover cancellation, stale answers, endpoint rules and
pane swap ordering. They do not touch a live review window.

Hunk loads TypeScript directly; no production build is needed. React and OpenTUI
remain development dependencies because Hunk supplies them to extensions.

[Interaction plan and release gate](docs/interaction-plan.md): implementation may
be pushed for review, but version remains **0.0.1**. Do not bump or publish before
explicit final-shape approval; any subsequently approved bump is at most patch.
