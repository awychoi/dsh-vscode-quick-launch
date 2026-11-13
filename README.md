# dsh-workspace-open

Opens a workspace in **VS Code** from two places in DeepSeek Harness:

1. the workspace **context menu** (right-click a workspace row or use its `…`
   button), placed after the shipped **Show in Finder** item and before
   **Delete**;
2. a **Session-header button**, immediately left of the header's overflow `…`
   menu — one click from the open conversation.

Each entry point can be switched off independently in Settings.

## Install

Use **Plugins → Add plugin** with this directory, or:

```sh
dsh plugin add /path/to/dsh-workspace-open
```

Requires the shipped `@deepseek-ai/dsh-host-open-in-app` row, mounted by
default in the Desktop and Web compositions. Without it neither entry point
appears.

## Turning parts off

Settings → General → **Open in VS Code** has two switches:

- Show in the workspace menu
- Show as a button in the session header

Both default to on and are stored in this browser's localStorage
(`dsh.workspace-open.settings.v1`).

## Behavior

Both entry points appear only when the Host detects an installed VS Code, and
launching reuses the shipped `open-in-app` routes, so no new Host surface or
credential handling is added. macOS, Windows, and Linux detection and launch
come from the Host catalog (`Visual Studio Code.app`, `Code.exe`, or the `code`
CLI). A launch failure shows a toast; remote browsers with no local
applications show neither entry point.

The header button opens the current Session's working directory (the workspace
folder for an ordinary session) and is hidden for a Session without a known
directory or while its preference is off.

## Related

The workspace folder status colors live in the separate
[`dsh-workspace-colors`](../dsh-workspace-colors/README.md) plugin.
