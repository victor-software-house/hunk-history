# hunk-commit-log

Review a branch one commit at a time or as an inclusive commit range in
[Hunk](https://hunk.dev): the commit series in a pane beside the diff, the
commit message above it, and keys to step between commits without leaving the
window.

This maintained fork adds inclusive, terminal-safe range review and full
human-readable author timestamps to
[Sadick Mwakio's original extension](https://github.com/sadick254/hunk-commit-log).

Hunk builds a revision review with `git show --format=`, which suppresses the
commit header, so a `hunk show` review says what changed and never what its
author said about it. This extension puts the commit back into the review.

Requires Hunk 0.19.0 or newer (extension API 6) and `git` on `PATH`.

A review in progress, reading this extension's own history: the commit series in
the left pane, the message above the diff, and `n` stepping between commits.

https://github.com/user-attachments/assets/8bc8ff58-d154-4f9f-8a2c-10256a051cc0

## What it adds

- **The reviewed commit in the review title**: `hunk-commit-log 3/11 e0ced7b
  feat(session): load a clicked commit into the live review`. The position also
  reaches `hunk session list`, so a window says which commit it holds.
- **A commit list on the left**, oldest at the top, the reviewed commit marked
  with `▸`. Click any row to load that commit into the same window. Press `v`
  to enter range mode: the heading changes from `Commits` to `Range` and shows
  the available controls, selected rows switch to the accent color, and a plain
  click or `n`/`p` chooses the other endpoint. Press `v` again to collapse back
  to the active commit.
- **The commit message on top**: subject, author, full author timestamp with its
  original UTC offset, and the body wrapped to the pane. A body taller than the
  pane reports how many lines it held back.
- **The message toned by what each part is**: the sha recedes, a Conventional
  Commits type leads, prose reads in the foreground, identifiers in backticks
  are picked out, and trailers and indented blocks recede. The tones name theme
  roles rather than colours, so they follow whatever theme is active.
- **`n` and `p`** to step to the next and previous commit in the series.

The extension initializes from a single-commit review and keeps the commit list
open for ranges selected from that review. Unrelated `hunk diff`, stash, and
patch reviews remain inert: the panes stay closed, the keys do nothing, and the
review title is Hunk's own.

## Install

Try it against one review, with nothing installed:

```sh
hunk show HEAD --extension /path/to/hunk-commit-log
```

Keep it, by naming the folder in `~/.config/hunk/config.toml`:

```toml
[extensions]
paths = ["/path/to/hunk-commit-log"]
```

Or install this maintained fork, which clones into
`~/.config/hunk/extensions/installed/hunk-commit-log/`:

```sh
hunk extension install victor-software-house/hunk-commit-log
```

Keep the repository named `hunk-commit-log`. The folder name becomes the
extension id, and the id is what namespaces the command ids, the pane keys, and
the config table below; a different name silently renames all of them.

## Configuration

```toml
[extension.hunk-commit-log]
range = "main..HEAD"   # the series to review; default: your unpushed commits
limit = 20             # most commits to gather when no range is set; max 500
messageRows = 8        # rows the message pane starts with; 3 to 60
```

**`range`** is any revision range `git rev-list` accepts. With a range set, the
series is exactly that range, which is usually what a reviewer means by "this
branch".

**Without a range**, the series is `@{upstream}..HEAD`: the commits your branch
has added on top of what it has pushed, newest `limit` of them. That is the
work you are reviewing on a branch you are still building, and because the
range ends at the branch tip rather than at the commit you opened, `n` has
somewhere to go from anywhere inside it.

**When there is no such work**, the series is the `limit` commits ending at the
commit you opened. That is what you get on a branch in sync with its upstream,
on a branch with no upstream at all, on a detached HEAD, and whenever you open
a commit that has already been pushed — the reviewed commit is not among the
unpushed ones, so the series has to come from somewhere that holds it. This
fallback is the old default, and it starts the review at the newest end of the
series where only `p` can move.

A configured range that does not contain the reviewed commit is not an error
either: it falls the same way, straight past the unpushed commits to recent
history. The extension records why through `hunk.log`, which Hunk 0.19.0
collects but does not appear to display anywhere, so in practice the fallback
is unobservable: if the position looks like plain recent history rather than
your branch, the range is the thing to check. The unpushed default never logs,
because nothing was asked for that it failed to honour.

**`messageRows`** is the height the message pane opens at. Drag its lower edge
to resize it in a session; Hunk keeps that size in session state and forgets it
on quit, so this is where a taller default belongs if your commits carry long
bodies. The default is deliberately small: a one-line commit should not cost the
diff eight rows.

A range that begins with `-` is ignored. A repository's own `.hunk/config.toml`
may set this table, and the value reaches a `git rev-list` argument list where a
leading dash reads as an option.

## Keys

| Key | Command id                   | Does                              |
| --- | ---------------------------- | --------------------------------- |
| `v` | `hunk-commit-log.range`      | Start or finish range selection   |
| `n` | `hunk-commit-log.next`       | Next commit or range endpoint     |
| `p` | `hunk-commit-log.previous`   | Previous commit or range endpoint |
| `h` | `hunk-commit-log.toggle`     | Show or hide the commit list      |
| `i` | `hunk-commit-log.message`    | Show or hide the commit message   |
| `I` | `hunk-commit-log.expand`     | Fit the pane to the message, or collapse it |

Remap them by command id in the `[keybindings]` table of your user config, which
is the only place Hunk reads keybindings from:

```toml
[keybindings]
"hunk-commit-log.next" = "ctrl+n"
"hunk-commit-log.previous" = false   # unbind
```

`]` and `[` would read better than `n` and `p`, and they are already
`hunk.review.nextHunk` and `hunk.review.previousHunk`. A built-in keeps a chord
an extension asks for, so those requests would be refused and the keys would do
nothing new.

Stepping does not wrap at either end, and a burst of steps loads the commit you
stopped on rather than every commit you passed through.

## How it works

- **Range mode is explicit and visible.** Press `v` to anchor the current
  commit. The heading changes immediately to `Range … click/n/p v exit`, and
  the anchor uses the accent selection color. A plain click or `n`/`p` moves
  the endpoint; pressing `v` again exits range mode at the active endpoint.
- **A selected range is inclusive.** The extension compares the first
  selected commit's parent (or Git's empty tree for a root commit) with the
  newest selected commit. The result is Git's net tree diff for the selected
  span, not a concatenation of each commit's patch.
- **No mouse modifier is required.** Terminals commonly reserve Shift-click
  for native text selection, so Hunk cannot reliably receive that gesture.
- **The range anchor is stable.** Pressing `v` anchors the commit currently on
  screen. Endpoint clicks and `n`/`p` keep that anchor until `v` exits the mode.
- **The reviewed ref comes out of the review title.** No extension API reports
  it, and Hunk's Git backend titles a revision review `<repo> show <ref>` and a
  range review `<repo> <range>`. The extension recognizes only single commits
  and the concrete range it requested itself; every other title is left alone.
- **The series is held, not recomputed.** Stepping keeps the series it started
  with and moves the position; only opening a commit outside it rebuilds it.
  Recomputing from each newly loaded commit would report `N/N` at every stop.
- **Loading a commit goes through the session daemon.** The extension API can
  navigate inside a loaded changeset but cannot load a different one, so a click
  or a step runs `hunk session reload <id> -- show <sha>` against this window,
  found by its own process id rather than by `--repo`, which would settle for
  any window open on the same checkout.

## Limits

- The commit list follows `git rev-list` order. A selected span across merge
  topology is still a net diff between its endpoint trees; highlighted rows do
  not mean Hunk concatenated those commits' individual patches.
- The commit list is a side pane, and Hunk drops a side pane that would squeeze
  the diff below its own minimum width. On a terminal too narrow for both, the
  review keeps its width and the list disappears until the window is wider. It
  comes back on its own; the pane stays open, it is only unrendered.
- The message pane has no scrolling of its own, because a pane never receives
  key events. `I` grows it to fit the message instead. Dragging the lower edge
  and `messageRows` set the collapsed height.
- Expanding is a swap between panes of a few fixed heights (8, 12, 18, 26, 36
  and 50 rows), because a pane's height is fixed when it is registered and no
  API resizes it afterwards. `I` opens the smallest one the message fits in, so
  the fit is exact to within a few rows rather than to the row. A message past
  fifty rows, or past what the terminal has once the diff keeps five, still
  shows its opening and reports the rest as a count.
- Only Git, and it cannot tell that it is not. Hunk's Jujutsu and Sapling
  backends title a revision review `<repo> show <rev>` exactly as the Git one
  does, so in a colocated repository this extension would match the title and
  then read the series with `git rev-list` for a revset Git happens to
  understand: `@` means the working-copy commit to `jj` and `HEAD` to Git. Use
  it in Git repositories. Where Git cannot resolve the revision at all, the
  extension stays inert, which is the harmless half of the same behaviour.

## Development

```sh
npm install         # devDependencies only
npm run typecheck   # tsc --noEmit
npm test            # node --test, no test framework
```

Hunk loads the TypeScript directly, so there is no build step. React and the
OpenTUI packages stay in `devDependencies` on purpose: Hunk serves its own
copies to extension files, and a second React means a second hooks dispatcher
and a pane that never renders.

The tests run against injected fakes for `git` and for the Hunk CLI, so they
never touch a repository or a live window.
