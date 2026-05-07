# Obsidian VFS

Browse, search, and edit your [Obsidian](https://obsidian.md) vault directly in VS Code via a virtual file system (`obs://`). Mount vault folders into the Explorer sidebar, navigate `[[wikilinks]]`, and open notes in Obsidian — all without leaving your editor.

## Features

- **Mount vault folders** into the Explorer tree view
- **Browse and read** Markdown files through the `obs://` virtual file system
- **Edit existing files** with writes going directly to the vault on disk
- **Wikilink navigation**, click `[[links]]` in Markdown to jump between notes (resolves to `file://` paths for seamless navigation in workspace folders)
- **Search notes** via Quick Pick across all vault Markdown files
- **Open in Obsidian**, jump to the current file in the Obsidian app
- **Auto-mount** configured folders on startup
- **Status bar** showing vault name and connection mode (`full` / `degraded`)
- **Workspace folder**, vault browsable in Explorer with Quick Open (`Cmd+P`) and Search (`Ctrl+Shift+F`) support
- **File watching**, changes in the vault are reflected in real time

## Commands

Available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `Obsidian VFS: Mount Folder` | Pick a top-level vault folder and add it to the Explorer tree view |
| `Obsidian VFS: Unmount Folder` | Remove a mounted vault folder from the tree view |
| `Obsidian VFS: Open in Obsidian` | Open the active vault file in the Obsidian app (works from both `obs://` and `file://` documents) |
| `Obsidian VFS: Search Notes` | Quick Pick search across all vault Markdown files |

## Settings

Configure via **Settings UI** or `settings.json`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `obsidianVFS.cliPath` | `string` | `"obsidian"` | Path to the Obsidian CLI binary |
| `obsidianVFS.timeoutMs` | `number` | `10000` | CLI operation timeout in milliseconds |
| `obsidianVFS.treeViewTitle` | `string` | `""` | Custom title for the Explorer tree view (defaults to `obs://<vault>`) |
| `obsidianVFS.autoMount` | `string[]` | `[]` | Vault-relative folders to display in the Explorer tree view on activation |
| `obsidianVFS.explorer` | `boolean` | `true` | Show the Obsidian VFS tree view in the Explorer sidebar |
| `obsidianVFS.statusBar` | `boolean` | `true` | Show vault name and mode in the status bar |
| `obsidianVFS.workspace` | `boolean` | `true` | Add the vault as a workspace folder for Explorer browsing (see below) |

All three toggle settings (`explorer`, `statusBar`, `workspace`) take effect immediately — no reload required.

### Workspace Folder

When `obsidianVFS.workspace` is enabled, the extension adds each `autoMount` folder as a `file://` workspace folder pointing to the actual directory on disk, named **obs://\<folder\>**. Because these are native file-system paths, VS Code's built-in file indexer (`ripgrep`) can index them — so vault files appear in **Quick Open** (`Cmd+P`) and **Search** (`Ctrl+Shift+F`).

The `obs://` FileSystemProvider remains registered for internal operations (stat, read, write, file watching). All user-facing navigation — wikilinks, search results, tree view items — resolves to `file://` URIs so they work seamlessly with workspace folders.

**Requirements:**

- At least one local folder must be open — vault folders are appended to the workspace folder list to avoid triggering an extension host restart.

**Notes:**

- The Explorer tree view and the workspace folders both appear in the sidebar. This duplication is an accepted trade-off — the tree view provides custom UI (welcome view, context menus), while the workspace folders enable Quick Open and cross-extension visibility.
- The vault's `.git` repository is automatically added to `git.ignoredRepositories` (user-level setting) when workspace folders are mounted, preventing VS Code's Git extension from listing it in Source Control. The entry is removed when `obsidianVFS.workspace` is disabled.

## Prerequisites

- [Obsidian](https://obsidian.md) installed with a vault open
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
