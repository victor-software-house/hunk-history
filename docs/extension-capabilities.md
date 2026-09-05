# Hunk extension capabilities and integration boundary

## Audited baseline

This audit uses **official `modem-dev/hunk`**, not the retired local Hunk fork.

- Published host and SDK: **hunkdiff 0.21.1**, exported API generation **16**.
- Official upstream main: [`622c0a3`](https://github.com/modem-dev/hunk/tree/622c0a363724ec20eeec6c392cc3058e3aacec52), API **18**.
- Public SDK import: `hunkdiff/extension`. It is a subpath of `hunkdiff`, not a
  separate SDK package. `hunkdiff` belongs in development dependencies for types.
- Hunk supplies the runtime API object and its own React/OpenTUI instances. Do not
  bundle a second renderer or React runtime.
- `hunk.apiVersion`/manifest `hunk.apiVersion` are API generations, not npm versions.
  A manifest declares the minimum host API accepted by the extension.

The previous no-CLI conclusion was wrong: it came from the extension's stale
**0.19.0** development dependency. `registerCliCommand` is present in published
0.21.1 and was already present in the installed 0.21.0. Do not repeat that claim.

## What extensions can contribute

| Surface | Public API | Authority and boundary |
|:--|:--|:--|
| Agent-callable CLI | `registerCliCommand` | Owns one top-level token and its argument subtree, e.g. `hunk history ...`; cannot replace built-ins or register beneath `hunk session`. |
| TUI actions | `registerCommand` | Namespaced action in Extensions menu; optional remappable keys. Not automatically callable through the session CLI. |
| Invoke native TUI actions | `ctx.commands.execute` / `isEnabled` | Command handlers can invoke explicitly public `hunk.*` actions, such as `hunk.app.refresh`. Cannot invoke other extensions' actions or arbitrary private host commands. |
| Docked UI | `registerPane` | Owns a component and local state. Host owns placement, dimensions, minimum diff space, availability and failure containment. |
| Alternate file presentation | `registerFileView` | Supplies rows/layout for matching files. Host retains diff geometry, navigation, raw fallback and note placement. |
| Source-line marks | `registerLineHighlighter` | Contributes character ranges and semantic tones without replacing the diff renderer. |
| Keyboard interpretation | `registerKeyboardMode` | Owns a deliberately activated mode. Host retains input precedence and exit paths. |
| Changeset transforms | `transformChangeset` | Can filter, reorder and retitle a loaded changeset; must preserve valid file metadata and unique ids. Not a new remote protocol. |
| VCS adapters | `registerVcsAdapter` | Can implement diff/show/stash operations and watch signatures/plans for another backend. Shipped backend names are reserved. |
| Theme/language definitions | `registerTheme`, `registerFileLanguage` | Add themes and extension/exact-filename/glob language mappings. |
| Session policy | `configureSession` | Current supported policy includes transient view preferences; not arbitrary configuration mutation. |
| Extension coordination | `hunk.events.on` / `emit` | Namespaced, in-process event bus among loaded extensions. Not cross-process RPC. |

## CLI commands really are programmatic commands

A `registerCliCommand` handler receives raw frozen arguments, cwd, cancellation,
stdin, and backpressure-aware stdout/stderr writers. It can return a normal exit
code and machine-readable JSON. An extension can implement `instructions`, `--help`,
`status`, or domain-specific operations beneath its own token.

Alternatively it can delegate once to a built-in Hunk command. Delegation cannot
chain into another extension, change extension bootstrap flags, or occur after
consuming stdin/writing stdout. Delegated `patch` reviews may carry structured
provider/commit/comparison metadata; that is not a general metadata attachment for
ordinary `show`/`diff` or a comment-ownership API.

**CLI handlers run in the CLI process.** Importing an extension's store there does
not read the state of an already-open TUI. To inspect or steer a live window, use
Hunk's existing `session list/get/context/review/reload/comment` commands. There is
no public extension registration for additional session-daemon methods.

During development:

```sh
hunk --extension /path/to/extension own-command status
```

Bare `hunk --help` is static and does not discover extensions. The extension owns
its own `--help`; unknown-command discovery lists registered summaries/usages.
There is **no automatic LLM prompt/skill injection hook**. A bundled skill or an
`instructions` CLI action is an explicit discoverable interface, not injected context.

## What extensions can inspect and monitor

| Need | Supported mechanism | Important limitation |
|:--|:--|:--|
| Complete saved comments | UI command `ctx.review.snapshot()` | Includes all saved store notes, stable file keys, anchors, generation and stateRevision; excludes drafts and static sidecars outside the store. Read-only. |
| Saved comment changes | `note_changed` | Covers create/update/remove from users and agent session commands. No replay/backlog; reload reconciliation is not emitted as note changes. |
| User composer activity | `note_created`, `note_edited` | Incremental user/composer events, not the authoritative comment inventory. |
| Commands | `command_executed` | Reports the dispatched built-in/extension command id. Not every shell/Git/daemon action, not a veto hook. |
| Navigation | `selection_changed`, `file_viewed`, `hunk_viewed` | Reports the current review's navigation; does not identify an independent history scope. |
| Review lifecycle | `startup`, `changeset_loaded`, `session_reload`, `shutdown` | Use fresh controls for the active generation; shutdown releases owned resources. |
| Host watch activity | `watch_reload_pending` and reload reason | Only covers Hunk's watched current input. It is not a repository-wide HEAD/index watcher. |
| Presentation | `filter_changed`, `theme_changed`, `layout_changed` | Observations of committed host changes. |
| Exact source | `ctx.workspace.readDocument` | Reads the reviewed old/new version, not automatically today's working-tree file. |

The published event context has panes, navigation and dialogs, but **does not have
command-context `review.snapshot()`**. Do not call a command-only capability from a
lifecycle callback. `note_changed` gives observers its complete saved-note payload;
a full resynchronization needs a supported command snapshot or the existing session
CLI, not a retained expired command context.

## Ownership, mutation and lifetime

- Register surfaces during the factory only. Factories normally survive content
  reloads; a new extension runtime can be loaded for changed cwd/trust/extension state.
- Keep extension-owned history, gesture and viewport state outside pane components.
  Do not depend on a particular host remount policy. Both soft updates and remounts
  must work; explicit view/scope changes still cancel gestures.
- Hunk owns its review store, comments, files, navigation and renderer. An extension
  can observe notes, but there is no general public `add/update/delete note` method
  on the extension context. Programmatic comments use the supported session CLI.
- Review controls expire on reload/teardown. After awaiting, re-read a snapshot and
  compare generation/stateRevision before consequential operations. A generation is
  not a Git SHA or per-commit note namespace.
- Host-mediated workspace writes require a supported unstaged working-tree review,
  an eligible reviewed file and user consent. They are not a general filesystem API.
- Extensions nevertheless execute with full process permissions. They may use normal
  JavaScript filesystem/network/process APIs, but those operations are outside the
  host's ownership safeguards. Repo-local extensions remain trust-gated.
- Use the attributed notification API or diagnostic log in the TUI, not stdout.
  CLI handlers use their leased writers and honor cancellation.

## Published release versus upstream main

Upstream main adds event-context `ctx.review.requestReload()` and reload reason
`"extension"` (API 18). **Published 0.21.1/API 16 does not declare that method.**
It requests a refresh of the *current* input; even on main it does not accept a new
commit/range target. Changing a live window from one commit to another still needs
the supported session reload path. Do not adopt unreleased imports or pretend npm
0.21.1 and main expose identical APIs.

## Consequences for hunk-history

1. Preserve the approved UI; comment rendering is not the requested problem.
2. Keep Hunk as the owner of comments. Do not introduce per-commit isolation or a
   parallel comment store without a separate product decision.
3. Keep the serialized official session CLI path for replacement comparisons.
   `requestReload()` would not replace it even after that API is released.
4. Independent async Git history/index polling is justified: host watch follows the
   selected diff, which can be pinned to old commits.
5. A future native `hunk history` command tree can expose agent instructions and
   stateless Git history queries or wrap supported session operations. It must not
   pretend to access live pane-private state. No such tree is implemented yet.
6. The current agent guide documents real built-in session operations. UI command ids
   remain UI-only. Original show/range title recognition is a host-convention dependency,
   not a typed review-target API; do not reuse it as an agent wire protocol.
7. SDK/toolchain and actual installed-host smoke tests must stay aligned. Typechecking
   against an older development SDK is not an audit of the running host.

## Fork status and verification

GitHub still identifies this repository as a fork of `sadick254/hunk-commit-log`.
A fresh fetch found **0 upstream-only commits and 14 downstream-only commits** at
trial commit `e9300d0`. Upstream tip and merge base are
`6a08a018bac73924bbc6c2e29008da2160739fcf`. There is nothing new to merge or adapt.

Verified the official `cli-tools` example's headless `status` action on installed
Hunk 0.21.1. Upgraded every development dependency, including TypeScript 7.0.2;
`npm outdated` reports no outdated direct dependencies. TypeScript 7.0.2 typecheck,
76 Node tests and 16 rendered pane tests pass. A separate 0.21.1 PTY loaded the
checkout, displayed live history/working-state rows, and handled session replacement,
next-commit navigation and manual refresh. Existing user review windows were untouched.

The manifest now requires API 16 instead of 6. OpenTUI's `bun-ffi-structs` dependency
still requires its own nested TypeScript 5 peer; the project's `tsc` is 7.0.2. Do not
force incompatible transitive peer upgrades. No release or comment-ownership redesign
is part of this dependency/alignment change.

## Sources

- [Public contract at audited main](https://github.com/modem-dev/hunk/blob/622c0a363724ec20eeec6c392cc3058e3aacec52/src/extension-api/types.ts)
- [Authoring guide](https://github.com/modem-dev/hunk/blob/622c0a363724ec20eeec6c392cc3058e3aacec52/docs/extensions.md)
- [CLI runtime](https://github.com/modem-dev/hunk/blob/622c0a363724ec20eeec6c392cc3058e3aacec52/src/extensions/cliCommandRuntime.ts)
- [Official CLI example](https://github.com/modem-dev/hunk/blob/622c0a363724ec20eeec6c392cc3058e3aacec52/examples/extensions/cli-tools/index.ts)
- Published baseline: `hunkdiff@0.21.1`, `dist/npm/extension/extension-api/types.d.ts`.
