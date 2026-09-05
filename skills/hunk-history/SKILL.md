---
name: hunk-history
description: Use when reviewing commits, inclusive or live ranges, new commits, staged or unstaged changes in a Hunk window with the hunk-history extension. Explains independent live history, immediate clicks and double-click ranges, and the supported agent session CLI operations.
---

# Hunk History

Retrieve this document from the enabled extension with `hunk history instructions`.
It is the same bundled file, not a separately maintained command manual. Check
`hunk --version`, then read the file returned by `hunk skill path review` for core
commands. If the history command is unavailable, do not assume history UI features
or silently install/enable the extension. Native show/diff/session commands below
do not require this extension.

CLI availability does not prove the extension is loaded in a particular live TUI.
Recheck assumptions after reloads, session changes or command failures; previously
loaded instructions do not grant or establish current capabilities.

Use the existing Hunk daemon CLI; do not launch an interactive TUI in a plain shell
or change a user's active review unless the task authorizes navigation.

## Discover before acting

```sh
hunk extension list
hunk session list --json
hunk session get SESSION_ID --json
hunk session context SESSION_ID --json
hunk session review SESSION_ID --json
```

Select the exact session id when more than one review is open. `session get` returns
a `session` object. Opt into `review --include-patch --json` only when patch text is
needed. Re-inspect context after a reload before navigating or attaching comments.

## Select the comparison explicitly

```sh
hunk session reload SESSION_ID -- show COMMIT_SHA
hunk session reload SESSION_ID -- diff BASE_SHA..TIP_SHA
hunk session reload SESSION_ID -- diff BASE_SHA..HEAD --watch
hunk session reload SESSION_ID -- diff BASE_SHA --watch
hunk session reload SESSION_ID -- diff --staged --watch
hunk session reload SESSION_ID -- diff --watch
hunk session reload SESSION_ID -- diff HEAD --watch
```

In order: one pinned commit; pinned tree range; fixed base through moving HEAD;
fixed base through working tree; staged changes; unstaged changes; combined net
uncommitted changes from HEAD. Ordinary `diff` is index versus working tree, not all
uncommitted changes. It includes untracked files by default. `--staged` compares
HEAD to index; a partly staged path can occur in both views. Combined changes can
cancel and are not concatenated patches. HEAD-based comparisons need a first commit;
staged/unstaged views remain meaningful before that commit.

For an inclusive commit selection, BASE_SHA is the oldest commit's **first parent**,
not that commit itself. For a root commit use Git's empty tree id:

```sh
git hash-object -t tree --stdin </dev/null
```

Ranges are net tree diffs. A linear list does not describe all merge topology.
Do not silently replace a pinned selection with a moving HEAD comparison.

## Extension behavior

The checkout trial owns a single Files/History pane. Tabs highlight on hover and
switch immediately without replacing the comparison. Files uses a vendored native
navigation projection and host selection actions, not a separate file or comment
store. Each tab retains its scroll position. This trial is not yet in release 0.0.3.

`s` hides/shows the whole sidebar while retaining its active tab. `h` switches
Files ↔ History without changing visibility. Native Files commands and existing
`hunk-history.files` mappings both toggle the whole replacement pane.

Working states have distinct `[S]`/`[W]` badges. The fixed footer offers Load older
commits while more pages exist; otherwise All N loaded explains why pagination is
unavailable. Loading comparison/history feedback occupies the existing status area.
Commit bodies scroll at the user-chosen pane height. Commit changes do not resize
it; `i` toggles visibility and `I` explicitly changes compact/expanded size.

History follows HEAD independently of the selected diff; configured scopes remain
explicit. Polling and pagination do not replace a pinned comparison. Rendering is
windowed; an old selected commit may remain loaded outside the browsed scope.

Single clicks dispatch immediately. Double-click arms a range, then the endpoint
click applies it. The first click can load a commit; Hunk's App remount must not
cancel the gesture. Escape and explicit tab switches cancel it. No Range button
or modifier gesture is required.

History scope, refresh, older pages and live comparisons are available through
Hunk's Extensions menu. Those are **UI command ids, not daemon subcommands**.
Published Hunk 0.21.1 supports extension-owned top-level CLI trees through
`registerCliCommand`; hunk-history provides `hunk history instructions` and
`hunk history --help`. It cannot add custom
subcommands to `hunk session` or inject instructions into an agent automatically.
Read this guide directly or load it as a skill. A CLI-created range is reviewable
but need not produce an extension-created highlighted range in the sidebar.

## Comments and extension capabilities

Comment commands act on the selected session's current comparison and old/new line
coordinates. Notes are session review state, not comments permanently owned by a
commit SHA. Refreshes and changes of comparison can retain notes on matching files.
Inspect the current session and comment list before editing or removing notes; do
not infer ownership from HEAD or from the originally displayed commit.

Extensions can observe saved user/agent note mutations through `note_changed` and
read complete saved notes through command-context `ctx.review.snapshot()`. UI actions
and headless CLI handlers have different contexts; a CLI handler cannot read a live
TUI's module-local store. Use existing session commands for cross-process access.
Read [the capability audit](https://github.com/victor-software-house/hunk-history/blob/main/docs/extension-capabilities.md) before changing
agent integration, note monitoring, or review control. It distinguishes published
API 16 from unreleased main API 18 and records the exact official source inspected.

Version 0.0.3 includes live history and this instructions command. Earlier 0.0.2
installations do not. Check `hunk extension list` and command availability; restart
an existing Hunk window to load updated extension code, preserving notes first.
