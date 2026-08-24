# hunk-commit-log

Review a branch one commit at a time in [Hunk](https://hunk.dev): the commit
series in a pane beside the diff, the commit message above it, and keys to step
between commits without leaving the window.

Hunk builds a revision review with `git show --format=`, which suppresses the
commit header, so a `hunk show` review says what changed and never what its
author said about it. This extension puts the commit back into the review.

Requires Hunk 0.19.0 or newer (extension API 6) and `git` on `PATH`.

## What it adds

- **The reviewed commit in the review title**: `twin-supply-chain 4/5 59e8a94a
  fix(frontend): read consignment documents as attachments`. The position also
  reaches `hunk session list`, so a window says which commit it holds.
- **A commit list on the left**, oldest at the top, the reviewed commit marked
  with `▸`. Click any row to load that commit into the same window.
- **The commit message on top**: subject, author, date, and the body wrapped to
  the pane. A body taller than the pane reports how many lines it held back.
- **`n` and `p`** to step to the next and previous commit in the series.

Every surface is inert outside a single-commit review: during `hunk diff`, a
stash review, or a patch review the panes stay closed, the keys do nothing, and
the review title is Hunk's own.

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

Or install it from a git repository, which clones into
`~/.config/hunk/extensions/installed/<repo-name>/`:

```sh
hunk extension install <owner>/hunk-commit-log
```

Keep the repository named `hunk-commit-log`. The folder name becomes the
extension id, and the id is what namespaces the command ids, the pane keys, and
the config table below; a different name silently renames all of them.

## Configuration

```toml
[extension.hunk-commit-log]
range = "main..HEAD"   # the series to review; default: recent history
limit = 20             # commits to gather when no range is set; max 500
messageRows = 8        # rows the message pane starts with; 3 to 60
```

**`range`** is any revision range `git rev-list` accepts. With a range set, the
series is exactly that range, which is usually what a reviewer means by "this
branch".

**Without a range**, the series is the `limit` commits ending at the commit you
opened. That always contains what you are looking at, which is why it is the
default, but it also means the review starts at the newest end of the series
where only `p` can move. Set `range` to land inside a branch with both
directions available.

A configured range that does not contain the reviewed commit is not an error:
the series falls back to recent history, silently. The extension records why
through `hunk.log`, which Hunk 0.19.0 collects but does not appear to display
anywhere, so in practice the fallback is unobservable: if the position looks
like plain recent history rather than your branch, the range is the thing to
check.

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
| `n` | `hunk-commit-log.next`       | Next commit in the series         |
| `p` | `hunk-commit-log.previous`   | Previous commit in the series     |
| `h` | `hunk-commit-log.toggle`     | Show or hide the commit list      |
| `i` | `hunk-commit-log.message`    | Show or hide the commit message   |
| `I` | `hunk-commit-log.expand`     | Expand the message, or collapse it |

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

- **The reviewed ref comes out of the review title.** No extension API reports
  it, and Hunk's git backend titles a revision review `<repo> show <ref>`. A
  title that does not match that shape is a review this extension leaves alone.
- **The series is held, not recomputed.** Stepping keeps the series it started
  with and moves the position; only opening a commit outside it rebuilds it.
  Recomputing from each newly loaded commit would report `N/N` at every stop.
- **Loading a commit goes through the session daemon.** The extension API can
  navigate inside a loaded changeset but cannot load a different one, so a click
  or a step runs `hunk session reload <id> -- show <sha>` against this window,
  found by its own process id rather than by `--repo`, which would settle for
  any window open on the same checkout.

## Limits

- The commit list is a side pane, and Hunk drops a side pane that would squeeze
  the diff below its own minimum width. On a terminal too narrow for both, the
  review keeps its width and the list disappears until the window is wider. It
  comes back on its own; the pane stays open, it is only unrendered.
- The message pane has no scrolling of its own, because a pane never receives
  key events. `I` expands it to as many rows as the terminal allows, which shows
  the whole message for any body that fits; beyond that the pane shows its
  opening and reports the rest as a count. Dragging the lower edge and
  `messageRows` set the collapsed height.
- Expanding swaps one pane for another, because a pane's height is fixed when it
  is registered and no API resizes it afterwards. The expanded pane takes every
  row Hunk will give it, so a three-line message looks lost in it; `I` again puts
  it back.
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
