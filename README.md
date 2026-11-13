# dsh-workspace-open

Two workspace-side affordances for the DeepSeek Harness sidebar:

1. **Open in VS Code** — right-click a workspace row (or use its `…` button) and
   pick the new row, placed after the shipped **Show in Finder** / **Show in
   folder** item and before **Delete**.
2. **Workspace status colors** — the folder glyph rolls up what is happening in
   that workspace's sessions.

## Install

Use **Plugins → Add plugin** with this directory, or:

```sh
dsh plugin add /path/to/dsh-workspace-open
```

Requires the shipped `@deepseek-ai/dsh-host-open-in-app` row (mounted by
default in the Desktop and Web compositions) for the VS Code action, and the
shipped `ui-workspace` + `ui-session` client plugins for the status colors.
Without them the corresponding part is simply absent.

## Open in VS Code

The row is available only when the Host detects an installed VS Code, and
launching reuses the shipped `open-in-app` routes, so no new Host surface or
credential handling is added. macOS, Windows, and Linux detection and launch
come from the Host catalog (`Visual Studio Code.app`, `Code.exe`, or the
`code` CLI). A launch failure shows a toast; remote browsers with no local
applications do not see the row.

## Workspace status colors

| folder color | meaning |
|---|---|
| red | a session waits for you — approval, plan review, or a question |
| pulsing amber | at least one session, or one of its subagents, is working |
| green | a session finished while you were not looking; clears once every finished session in that workspace has been opened |
| unchanged (gray / blue) | idle, or everything already read |

Precedence is red → amber → green. The ungrouped bucket behaves the same for
sessions that belong to no workspace. Sessions that are archived, blank, or
subagent conversations do not speak for a workspace; subagent work reaches its
parent through the running child count (the same direct children the header
subagent dropdown lists). Busy pulses are suppressed under
`prefers-reduced-motion`.

Colors use the theme's own status tokens, so light and dark themes both work.
The existing glyph is recolored in place — the open/closed folder shape and the
hover chevron stay intact.

### Note on the implementation

DSH does not yet expose a slot for decorating a workspace header row, so this
layer keys off the shipped row attribute `data-row-key="workspace:<id>"`. If a
future DSH release changes that markup, the layer stops painting and the folder
simply returns to its normal colors — nothing else breaks. A supported
`sidebar.workspaces.workspace.leading` seat would let this move to the normal
slot API.
