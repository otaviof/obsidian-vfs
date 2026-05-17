# `AGENTS.md`

## Project

Virtual file-system sharing Obsidian notes with VSCode and Claude Code.

## Architecture

No cross-dependencies between `vscode`, `claude-plugin`, `cli`. Shared logic goes in `core`. Entry points: [CONTRIBUTING.md#architecture](CONTRIBUTING.md#architecture).

Hook handler: self-contained bundle at `bundle/hook-handler.mjs` (tracked in git). Details: [CONTRIBUTING.md#hook-handler-bundle](CONTRIBUTING.md#hook-handler-bundle).

## Build & Verification

**Do NOT run bare `pnpm ci`** -- that is pnpm's clean-install and wipes `node_modules`. Use `pnpm run ci`.

**Always run `pnpm format:check` before reporting work as done.** This is not covered by `pnpm run ci` and will catch Prettier violations. Fix with `pnpm format` if needed.

Toolchain, scripts, workflows: [CONTRIBUTING.md#toolchain](CONTRIBUTING.md#toolchain), [CONTRIBUTING.md#scripts](CONTRIBUTING.md#scripts).

## Conventions

Style, file layout, patterns: [CONTRIBUTING.md#conventions](CONTRIBUTING.md#conventions).

### Versioning (bump checklist)

- **VSCode**: `packages/vscode/package.json`
- **Claude plugin**: `.claude-plugin/marketplace.json`, `packages/claude-plugin/package.json`, `.claude-plugin/plugin.json` (all three must match)
- **npm packages**: `packages/core/package.json` + `packages/cli/package.json` (must match)

## VSCode: Workspace Folder Architecture

- **Single `file://` workspace folder at the vault root** for Quick Open (`Cmd+P`) and `Ctrl+Shift+F` search. VSCode's file discovery and ripgrep indexer only operate on `file://` workspace folders — `obs://` workspace folders provide zero discoverability (confirmed by spike, 2026-05-15).
- **`files.exclude` patterns** hide non-autoMount vault content to match the Explorer tree view's visibility. Two-tier split: dotfiles + `blocked` → `ConfigurationTarget.WorkspaceFolder` (`<vault>/.vscode/settings.json`); non-autoMount dirs + file extension globs → `ConfigurationTarget.Workspace`. Tracked in `context.workspaceState`, cleaned up on change or disable. All defaults come from `package.json` (single source of truth).
- **Vault-side exclusion toggles** — `vault.excludeDotfiles` + `vault.excludeDotfilePattern` control dotfile hiding; `vault.excludeBlocked` controls blocked-path hiding; `vault.gitIgnore` controls `git.ignoredRepositories` management. Each is independently toggleable at runtime.
- **Sub-path exclusion** — when `autoMount` contains nested paths (e.g., `["20-areas/idea"]`), `files.exclude` patterns hide sibling directories (`20-areas/career`, `20-areas/otaviof`) to match tree view visibility. Computed via mount tree (`packages/core/src/mount-tree.ts`). Controlled by `workspace.excludeUnmountedFolders`.
- **File-level exclusion** — `obsidianVFS.workspace.excludeUnmountedFilePattern` provides a regex tested against file basenames at partially-mounted levels. Matching files generate `{prefix}/*{ext}` glob patterns in the folder-scoped `files.exclude` tier, hiding Obsidian files (`.md`, `.base`, `.canvas`) from Explorer and Quick Open without affecting same-named files in other workspace folders. Gated by `workspace.excludeUnmountedFiles` toggle. Default: `\\.(md|base|canvas)$`.
- **Vault write protection** — `obsidianVFS.vault.mode` controls write access through the `obs://` FileSystemProvider. `"ro"` registers the provider with `isReadonly: true`; `"partial"` enforces autoMount-scoped writes at the provider level. Protection covers tree view operations, drag-and-drop into the tree, and `obs://` editor saves. The `file://` workspace folder (Explorer panel, Quick Open, Search) bypasses the provider entirely — drag-and-drop, rename, delete, and editor saves via `file://` remain writable regardless of vault mode. This gap closes when `FileSearchProvider`/`TextSearchProvider` stabilize.
- **`obs://` FileSystemProvider** remains registered for the Explorer tree view sidebar, wikilinks, drag-and-drop, and watch events — it does not back a workspace folder.
- **`FileSearchProvider`/`TextSearchProvider` are proposed (unstable) APIs** as of `@types/vscode@1.118.0`. When stabilized, the extension can switch to a single `obs://` workspace folder with native search, eliminating the `files.exclude` workaround. Check `@types/vscode` for stable availability — do not use while proposed.

## Documentation

Update the package's README and CONTRIBUTING.md when changes affect user-facing behavior or API surface. Link, don't duplicate.
