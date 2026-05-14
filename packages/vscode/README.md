<p align="center">
  <img src="https://raw.githubusercontent.com/otaviof/obsidian-vfs/refs/heads/main/packages/vscode/obsidian-vfs.png" alt="Obsidian VFS" width="200" />
  <br>
</p>

# Obsidian VFS

Browse, search, and edit your [Obsidian](https://obsidian.md) vault directly in VS Code via a virtual file system (`obs://`). Mount vault folders into the Explorer sidebar, navigate `[[wikilinks]]`, and open notes in Obsidian — all without leaving your editor.

## Features

- **Mount vault folders or individual notes** into the Explorer tree view
- **Browse and read** Markdown files through the `obs://` virtual file system
- **Edit existing files** with writes going directly to the vault on disk
- **Wikilink navigation**, click `[[links]]` in Markdown to jump between notes
- **Search notes** via Quick Pick across all vault Markdown files
- **Open in Obsidian**, jump to the current file in the Obsidian app
- **Copy path** as `obs://` URI to the clipboard (`Shift+Alt+Cmd+C` on `obs://` files)
- **Auto-mount** configured folders on startup
- **Status bar** showing vault name and connection mode (`full` / `degraded`)
- **Workspace folder**, vault browsable in Explorer with Quick Open (`Cmd+P`) and Search (`Ctrl+Shift+F`) support
- **File watching**, changes in the vault are reflected in real time

## Commands

Available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `Obsidian VFS: Mount Folder` | Pick a top-level vault folder and add it to the Explorer tree view |
| `Obsidian VFS: Mount Note` | Search vault notes and add one to the Explorer tree view |
| `Obsidian VFS: Unmount Entry` | Remove a mounted vault entry from the tree view |
| `Obsidian VFS: Open in Obsidian` | Open the active vault file in the Obsidian app (works from both `obs://` and `file://` documents) |
| `Obsidian VFS: Search Notes` | Quick Pick search across all vault Markdown files |
| `Obsidian VFS: Copy Path` | Copy the active file's `obs://` URI to the clipboard (`Shift+Alt+Cmd+C` on `obs://` files) |

## Settings

Configure via **Settings UI** or `settings.json`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `obsidianVFS.cliPath` | `string` | `"obsidian"` | Path to the Obsidian CLI binary |
| `obsidianVFS.timeoutMs` | `number` | `10000` | CLI operation timeout in milliseconds |
| `obsidianVFS.treeViewTitle` | `string` | `""` | Custom title for the Explorer tree view (defaults to `obs://<vault>`) |
| `obsidianVFS.autoMount` | `string[]` | `[]` | Vault-relative paths (folders or notes) to display in the Explorer tree view on activation |
| `obsidianVFS.explorer` | `boolean` | `true` | Show the Obsidian VFS tree view in the Explorer sidebar |
| `obsidianVFS.statusBar` | `boolean` | `true` | Show vault name and mode in the status bar |
| `obsidianVFS.workspace` | `boolean` | `true` | Add the vault as a workspace folder for Explorer browsing (see below) |

All three toggle settings (`explorer`, `statusBar`, `workspace`) take effect immediately — no reload required.

### Workspace Folder

When `obsidianVFS.workspace` is enabled, the extension adds a single **obs://\<vault\>** workspace folder using the `obs://` virtual file system. Mounted `autoMount` entries appear as children under this root — the Explorer shows one vault entry instead of one per folder. VS Code's **Search** (`Ctrl+Shift+F`) and **Quick Open** (`Cmd+P`) work across mounted content through the `FileSystemProvider`.

All file operations — stat, read, write, directory listing, and file watching — go through the `obs://` provider, which enforces `allowed`/`blocked` security rules from [`.obsidian/obsidian-vfs.json`](../../README.md#vault-configuration) at every level.

**Requirements:**

- At least one local folder must be open — the vault workspace folder is appended to the list to avoid triggering an extension host restart.

**Notes:**

- The Explorer tree view and the workspace folder both appear in the sidebar. The tree view provides custom UI (welcome view, context menus), while the workspace folder enables Quick Open and cross-extension visibility. The tree view uses `file://` URIs for opening files, which enables native features like Git integration.
- `autoMount` entries outside `allowed` or inside `blocked` are filtered from the workspace folder root listing. The core security layer remains as defense-in-depth for navigation into subdirectories.
- The vault's `.git` repository is automatically added to `git.ignoredRepositories` (user-level setting) when the workspace folder is mounted, preventing VS Code's Git extension from listing it in Source Control. The entry is removed when `obsidianVFS.workspace` is disabled.

## Related Tools

This VSCode extension provides file-system access and UI integration for Obsidian vaults. If you use **Claude Code**, the companion [`@obsidian-vfs/claude-plugin`](https://github.com/otaviof/obsidian-vfs/tree/main/packages/claude-plugin) enables Claude to read and search your vault via `@obs:` mentions and automatically resolves wikilinks in agent definitions and skills.

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
