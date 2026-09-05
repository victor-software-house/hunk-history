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
- **Double-click either endpoint** to start a range. The anchor is highlighted;
  the header temporarily shows **End · Esc**. Nothing loads yet.
- **Click the other endpoint** to immediately load the inclusive range. Oldest-first
  and newest-first work identically. Clicking the same endpoint loads one commit.
- **Esc** cancels. Switching to Files or replacing the review also cancels the draft.
- Single-click navigation waits 300 ms to distinguish a double-click. Once a range
  is loaded, a single click returns to a single-commit review.

No dragging, Shift-click, ellipsis menu or separate Apply action is required.
The closing click highlights the requested range immediately with a **Loading** label.
The diff remains the previously loaded review until the request succeeds; failure restores its
selection. Selected backgrounds stay continuous during hover, including trailing row space.

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

The **Show commit review scope** command identifies which commits the list represents. For a branch
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
| — | `hunk-history.scope` | Show commit review scope |

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
The pointer tests exercise real double-clicks and releases in both endpoint orders,
Escape, delayed single navigation, scrolling, drag rejection, failed loads and Files
hover feedback. The production request queue uses only an injected Hunk CLI seam.
Direct tests cover pane swap ordering. They do not touch a live review window.

Hunk loads TypeScript directly; no production build is needed. React and OpenTUI
remain development dependencies because Hunk supplies them to extensions.

[Interaction plan and release gate](docs/interaction-plan.md): implementation may
be pushed for review, but version remains **0.0.1**. Do not bump or publish before
explicit final-shape approval; any subsequently approved bump is at most patch.
