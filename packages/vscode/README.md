# Obsidian VFS

Browse, search, and edit your [Obsidian](https://obsidian.md) vault directly in VS Code via a read-only virtual file system (`obs://`). Mount vault folders into the Explorer sidebar, navigate `[[wikilinks]]`, and open notes in Obsidian — all without leaving your editor.

## Features

- **Mount vault folders** into the Explorer tree view
- **Browse and read** Markdown files through the `obs://` virtual file system
- **Edit existing files** with writes going directly to the vault on disk
- **Wikilink navigation** — click `[[links]]` in Markdown to jump between notes
- **Search notes** via Quick Pick across all vault Markdown files
- **Open in Obsidian** — jump to the current file in the Obsidian app
- **Auto-mount** configured folders on startup
- **Status bar** showing vault name and connection mode (`full` / `degraded`)
- **File watching** — changes in the vault are reflected in real time

## Commands

Available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `Obsidian VFS: Mount Folder` | Pick a top-level vault folder and add it to the Explorer tree view |
| `Obsidian VFS: Unmount Folder` | Remove a mounted vault folder from the tree view |
| `Obsidian VFS: Open in Obsidian` | Open the active `obs://` file in the Obsidian app |
| `Obsidian VFS: Search Notes` | Quick Pick search across all vault Markdown files |

## Settings

Configure via **Settings UI** or `settings.json`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `obsidianVFS.cliPath` | `string` | `"obsidian"` | Path to the Obsidian CLI binary |
| `obsidianVFS.timeoutMs` | `number` | `10000` | CLI operation timeout in milliseconds |
| `obsidianVFS.treeViewTitle` | `string` | `""` | Custom title for the Explorer tree view (defaults to `Obsidian: <vault>`) |
| `obsidianVFS.autoMount` | `string[]` | `[]` | Vault-relative folders to display in the Explorer tree view on activation |

## Prerequisites

- [Obsidian](https://obsidian.md) running with the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin
- The `obsidian` CLI on your PATH (or set `obsidianVFS.cliPath`)

## Installation

### From VSIX

```sh
code --install-extension obsidian-vfs.vsix
```

Or via the Extensions sidebar: **`···` menu > Install from VSIX...**

### From Source

```sh
git clone https://github.com/otaviof/obsidian-vfs.git
cd obsidian-vfs
pnpm install
pnpm package:vscode
code --install-extension packages/vscode/obsidian-vfs.vsix
```

Reload the window after installing (**Developer: Reload Window**).
