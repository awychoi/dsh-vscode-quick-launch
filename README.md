# dsh-workspace-open

Open a workspace in **VS Code** straight from its context menu in the DeepSeek
Harness sidebar.

Right-click a workspace row — or use its `…` button — and pick **Open in VS
Code**. The row sits after the shipped **Show in Finder** / **Show in folder**
item and before **Delete**. The action is available only when the Host detects
an installed VS Code, and launching reuses the shipped `open-in-app` routes, so
no new Host surface or credential handling is added.

## Install

Use **Plugins → Add plugin** with this directory, or:

```sh
dsh plugin add /path/to/dsh-workspace-open
```

Requires the shipped `@deepseek-ai/dsh-host-open-in-app` row (mounted by
default in the Desktop and Web compositions). Without it the row is simply
absent.

## Notes

- The menu row is data-only; it uses the shared `contextMenu.icon` slot for its
  glyph and falls back to a neutral arrow when the Host icon is unavailable.
- macOS, Windows, and Linux detection and launch come from the Host catalog
  (`Visual Studio Code.app`, `Code.exe`, or the `code` CLI).
- A launch failure shows a toast; remote browsers with no local applications
  simply do not see the row.
