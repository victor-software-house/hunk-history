---
name: hunk-history
description: Use when reviewing commits, inclusive or live ranges, new commits, staged or unstaged changes in a Hunk window with the hunk-history extension. Explains independent live history, immediate clicks and double-click ranges, and the supported agent session CLI operations.
---

# Hunk History

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

The unreleased live-history trial follows HEAD independently of the selected diff;
configured scopes remain explicit. History and working-state counts refresh without
replacing the pinned review. Loading more history is paginated and rendering is
windowed. An old selected commit can remain loaded outside the browsed scope.

Single clicks dispatch immediately. Double-click arms a range, then the endpoint
click applies it. The first click can load a commit; Hunk's App remount must not
cancel the gesture. Escape and explicit view switches cancel it. No extra Range
button or modifier gesture is required.

History scope, refresh, older pages and live comparisons are available through
Hunk's Extensions menu. Those are **UI command ids, not daemon subcommands**.
The current public extension API cannot register model instructions, custom session
commands or CLI subcommands. This guide must be read or loaded as an agent skill;
Hunk does not inject it automatically. A CLI-created range is reviewable but need
not produce an extension-created highlighted range in the sidebar.

The Git-tagged 0.0.2 release predates the live-history trial. Check the loaded source
before assuming trial behavior. Do not bump or release the trial until the operator
has live-tested and explicitly approved it.
