<p align="center">
  <img src="https://raw.githubusercontent.com/otaviof/obsidian-vfs/refs/heads/main/packages/vscode/resources/obsidian-vfs.png" alt="Obsidian VFS" width="200" />
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
- **Workspace file**, generate a named `.code-workspace` to avoid the "Untitled Workspace" label
- **File watching**, changes in the vault are reflected in real time

## Commands

Available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `Obsidian VFS: Mount Folder` | Pick a vault folder (depth controlled by `depthLimit` setting) and add it to the Explorer tree view |
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
| `obsidianVFS.depthLimit` | `number` | `4` | Maximum directory depth when listing vault folders and notes (`0`: unlimited, `1`: top-level only) |
| `obsidianVFS.explorer` | `boolean` | `true` | Show the Obsidian VFS tree view in the Explorer sidebar |
| `obsidianVFS.statusBar` | `boolean` | `true` | Show vault name and mode in the status bar |
| `obsidianVFS.workspace` | `boolean` | `true` | Add the vault as a workspace folder for Quick Open and Search (see below) |
| `obsidianVFS.workspaceFile` | `boolean` | `false` | Generate a `.code-workspace` file named after the project folder. Eliminates the "Untitled (Workspace)" label. The file contains a `file://` vault folder entry; `files.exclude` patterns are written to its `settings` section. Opening the file triggers a one-time window reload. |

All three toggle settings (`explorer`, `statusBar`, `workspace`) take effect immediately — no reload required.

### Workspace Folder

When `obsidianVFS.workspace` is enabled and at least one `autoMount` entry is configured, the extension adds a single `file://` workspace folder at the vault root (named **obs://\<vault\>** in the sidebar). VS Code's **Quick Open** (`Cmd+P`) and **Search** (`Ctrl+Shift+F`) discover vault files through this folder.

Non-autoMount vault content (`.obsidian/`, `.trash/`, and any directories not in `autoMount`) is hidden from Explorer and Quick Open via `files.exclude` patterns managed by the extension. Your own `files.exclude` patterns are never modified or removed.

**Requirements:**

- At least one local folder must be open — the vault workspace folder is appended to the list to avoid triggering an extension host restart.
- At least one `autoMount` entry must be configured — the workspace folder is not added when `autoMount` is empty.

**How it works:**

- The extension scans the vault root and adds `files.exclude` patterns for entries not in `autoMount`. Patterns are split into two tiers: vault-global patterns (dotfiles and `blocked` paths from `.obsidian-vfs.json`) are written to `<vault>/.vscode/settings.json`; remaining non-autoMount directories are written to workspace settings. All managed patterns are tracked internally for cleanup.
- When `autoMount` entries change, patterns are re-synced automatically — stale patterns are removed and new ones added.
- When `obsidianVFS.workspace` is disabled, all managed patterns are removed and the workspace folder is deleted.
- The vault's `.git` repository is automatically added to `git.ignoredRepositories` (user-level setting) when the workspace folder is mounted, preventing VS Code's Git extension from listing it in Source Control. The entry is removed when `obsidianVFS.workspace` is disabled.

**Known limitations:**

- **Vault `.vscode/` directory:** The extension creates `.vscode/settings.json` inside the vault for vault-global `files.exclude` patterns (dotfiles and `blocked` paths). These patterns are independent of `autoMount` and apply to any workspace that includes the vault. The `.vscode/` directory itself is never managed by the extension — if you want to hide it, add `.vscode` to your own `files.exclude`. When `obsidianVFS.workspace` is disabled, all managed patterns are removed from both folder and workspace settings. If your vault is git-tracked, consider adding `.vscode/` to the vault's `.gitignore`.
- **Not a security boundary:** `files.exclude` hides content from Explorer and Quick Open but does not enforce access restrictions. The `obs://` FileSystemProvider's path security (`allowed`/`blocked` lists in `.obsidian-vfs.json`) applies to TreeView, wikilink, and drag-and-drop operations.
- **Title bar:** Adding the vault as a workspace folder creates a multi-root workspace. VS Code may show "UNTITLED (WORKSPACE)" in the title bar.

**Notes:**

- The Explorer tree view and the workspace folder both appear in the sidebar. The tree view provides custom UI (welcome view, context menus, drag-and-drop), while the workspace folder enables Quick Open and full-text search.
- The `obs://` FileSystemProvider remains registered for the TreeView sidebar, wikilink navigation, and drag-and-drop — it does not back a workspace folder.

### Workspace File (avoiding "Untitled Workspace")

When `obsidianVFS.workspace` adds the vault folder dynamically, VS Code transitions to a multi-root workspace. Because no `.code-workspace` file is involved, the title bar shows **"UNTITLED (WORKSPACE)"** — this is standard VS Code behavior for unsaved multi-root workspaces.

Enable `obsidianVFS.workspaceFile` to fix this. The extension generates a `<project-name>.code-workspace` file in your project root (e.g., `my-app.code-workspace`) and prompts you to open it.

**What happens when you enable it:**

1. The extension creates `<project-name>.code-workspace` in your project root containing the local folder(s) and the `file://` vault folder entry (named `obs://<VaultName>`).
2. A notification asks: _"Open workspace file? This will reload the window."_
3. If you click **Open**, the window reloads once. After that, the title bar shows the project name and the vault is part of the saved workspace.
4. On subsequent activations, the extension detects you're already in a saved workspace and skips the prompt. Vault-global `files.exclude` patterns (dotfiles and `blocked` paths) are written to `<vault>/.vscode/settings.json`; workspace-specific patterns (non-autoMount directories) are written to workspace settings (routed to the `.code-workspace` file when one is active, or to the project's `.vscode/settings.json` otherwise).
5. If you click **Not Now**, the extension falls back to adding the vault dynamically via `updateWorkspaceFolders` (with `files.exclude` patterns in the vault's `.vscode/settings.json`). You can open the generated workspace file later.

**UX trade-offs:**

- **One-time window reload** — opening the workspace file causes VS Code to reload the window. This only happens once; after that the workspace file is saved and reloads are not needed.
- **File on disk** — a `.code-workspace` file is created in your project root. You can commit it to version control (so teammates get the same workspace layout) or add it to `.gitignore`.
- **No overwrite** — if a `.code-workspace` file already exists (e.g., from a previous run or your own), the extension will not overwrite it. It offers to open the existing file instead.
- **`files.exclude` containment** — vault-global patterns (dotfiles and `blocked` paths) are scoped to the vault workspace folder, preventing vault dotfiles (`.git`, `.obsidian`) from hiding same-named entries in your project. Workspace-specific patterns (non-autoMount directories like `00-inbox`, `40-log`) use workspace settings and are unlikely to collide with project entries.

**When to use each setting:**

| Goal | Setting |
|------|---------|
| Browse vault in Explorer, Quick Open, Search (accept "Untitled Workspace" label) | `workspace: true` |
| Same as above, but with a proper project name in the title bar | `workspace: true` + `workspaceFile: true` |
| Browse vault only via the sidebar tree view (no workspace folder at all) | `workspace: false` |

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
