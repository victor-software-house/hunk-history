# hunk-history

Browse live Git history, review individual commits and inclusive ranges, and switch
between staged and unstaged changes in [Hunk](https://hunk.dev). Built on
[Sadick Mwakio's hunk-commit-log](https://github.com/sadick254/hunk-commit-log).

Developed and verified against Hunk **0.21.1** and its published extension API **16**,
with Git on PATH. **0.0.3** includes live history, immediate clicks, preserved
range gestures, and the agent instructions command.

## Interaction

- **Single-click a commit:** request its diff immediately. No double-click waiting period.
- **Double-click either endpoint:** arm a range. **Click the other endpoint** to load
  its inclusive net diff. Either direction works; equal endpoints show one commit.
- The first click of a double-click can start loading its commit. Its completion,
  including Hunk's full App remount, does not cancel the second click or armed range.
- **Esc** cancels the gesture. Files/Commits switches and external review replacement
  also cancel it. No Range button, unusual key combination, drag selection or Apply step.
- **Staged / Unstaged:** two compact rows above history select those comparisons.
  Counts are changed paths, not hunks; a partly staged file can count in both rows.
  Unstaged includes untracked files. Zero is a valid empty review, not a disabled action.
- **Files / Commits:** `h` swaps views in one sidebar. `[Files]` switches back to the
  native file tree. Default history width is 34 columns; narrow terminals may hide it.

Requested selections paint immediately with `Loading`. The old diff remains until
the reload succeeds; failures restore its selection. Reloads serialize and rapid
navigation coalesces to the latest requested target. Session discovery uses this
window's PID, never an arbitrary window on the same checkout.

## Live history and scope

History browsing is independent of the loaded diff. By default it follows **HEAD**,
ordered oldest first. New commits update the list without replacing a selected
commit or pinned range. The existing header shows **N new**; click it to review the
newest commit. A commit outside the current history scope still retains its loaded
message and diff.

History and staged/unstaged counts are checked asynchronously every 1.5 seconds,
with serialized Git queries. Metadata is fetched in batches and only nearby rows
are rendered. **Load older…** at the top fetches another page; `p` also fetches older
history at the loaded edge. There is no total commit limit. `limit` is the page size
(default 50, clamped to 1–500), not a cap on browsable history.

The **Extensions** menu exposes **Choose history scope**: current branch, configured
range (when present), or history through the selected commit (pinned). A configured
scope remains explicit; an unavailable scope reports an error rather than silently
broadening to unrelated history. Existing rows remain while a replacement loads or
fails. A branch rewrite can move the loaded commit outside the list without changing
its diff.

```toml
[extension.hunk-history]
range = "origin/main..HEAD" # optional; otherwise browse HEAD
limit = 50                # page size, not a total-history cap
messageRows = 8
```

Configuration is read at extension startup; restart Hunk after editing it.

## Comparisons and commands

All UI commands appear in Hunk's **Extensions** menu, including unbound
commands. The separate CLI tree exposes instructions and help.

| Key | Command id | Action |
|:--|:--|:--|
| `n` / `p` | `hunk-history.next` / `.previous` | Next / previous commit; no wrap |
| `h` | `hunk-history.toggle` | Switch Files / Commits |
| — | `hunk-history.files` | Close Commits, toggle Files |
| `i` | `hunk-history.message` | Toggle commit message |
| `I` | `hunk-history.expand` | Fit/collapse message |
| — | `hunk-history.scope` | Choose history scope |
| — | `hunk-history.refresh` | Refresh history and working-state counts |
| — | `hunk-history.older` | Load an older history page |
| — | `hunk-history.staged` / `.unstaged` | Review staged / unstaged changes |
| — | `hunk-history.all` | Review net uncommitted changes from HEAD |
| — | `hunk-history.through-head` | Selection's base through moving HEAD |
| — | `hunk-history.through-worktree` | Selection's base through working tree |

**Through HEAD** and **Through working tree** explicitly create live comparisons
with Hunk watch enabled. The base is the oldest selected commit's parent, so the
selection is inclusive. A normal clicked range stays pinned to concrete SHAs.
Staged/unstaged rows are not fake commits or range endpoints. These controls only
select reviews: they never stage, unstage, commit, fetch or modify repository files.

A range is a **net tree diff**, not concatenated patches. Merge topology can include
effects not represented by the linear highlighted rows. Combined uncommitted changes
are also a net comparison; staged and unstaged edits can cancel each other.

To make native `s` exclusive with Commits, retain this explicit user-config override:

```toml
[keybindings]
"hunk.view.toggleFilesPane" = false
"hunk-history.files" = "s"
```

Without the extension that binding is unavailable; remove it to restore native `s`.
Other explicit host pane commands are not intercepted. `[` and `]` remain Hunk's
hunk-navigation keys.

The message pane shows the author, timestamp with original UTC offset, and body.
`messageRows` sets its initial height (3–60). Drag the divider to resize it. `I` picks
among 8, 12, 18, 26, 36 and 50 rows; longer messages report omitted lines. No message
scrolling is introduced.

## Install or live-test

Install the approved release:

```sh
hunk extension install victor-software-house/hunk-history@v0.0.3
```

For an existing unpinned installation, run `hunk extension update hunk-history`.
Restart Hunk after updating to load the new extension code; preserve any review
notes before closing a window. Confirm `hunk extension list` reports 0.0.3 and
`hunk history --help` lists the instruction command.

Test this checkout **without replacing the installed release**, from a Git repository:

```sh
hunk show HEAD --extension /absolute/path/to/hunk-history
```

An explicit extension takes precedence over the installed copy with the same id;
Hunk may report that the duplicate installed copy was skipped. The id and config
namespace remain `hunk-history`. Start a new Hunk window after source changes; a
session diff reload does not reload extension code.

## Coding agents

Run `hunk history instructions` to read the bundled
[Hunk History agent guide](skills/hunk-history/SKILL.md), or `hunk history --help`
for usage. The command reads that exact file. It documents
supported `hunk session reload`, `context` and `review` operations for pinned/live
ranges and working states. Agents can load this file directly, or operators can
register its directory with their agent's skill loader.

**Hunk does not automatically inject this guide into an agent's context.** This
extension registers a top-level `history` CLI tree for instructions and help.
Other operations use native session commands; UI ids remain UI-only. Installed
is not necessarily enabled, and CLI availability does not prove the extension is
loaded in a particular live window. Recheck after reloads/session changes and do
not silently enable a missing extension. Hunk does not support custom subcommands under
`hunk session`. Read the installed core guide using `hunk skill path review` rather
than maintaining a copied host manual. See the
[capability and ownership audit](docs/extension-capabilities.md) for agent-callable
commands, comment monitoring, snapshots, and published-versus-main API differences.

## Development

```sh
npm install
npm run typecheck
npm test
git diff --check
```

No production build: Hunk loads TypeScript directly and supplies React/OpenTUI.
Node runs pure and disposable real-Git tests. Bun runs the existing OpenTUI pointer
suite, including full-pane remounts, immediate dispatch, request ordering, scrolling,
hover and failures. No new dependencies or test framework are needed.

[Trial plan](docs/live-history-plan.md) · [Interaction decisions](docs/interaction-plan.md).
The live-approved interaction and instruction discovery ship together in 0.0.3.
