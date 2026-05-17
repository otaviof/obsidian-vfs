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
- **Vault-side exclusion toggles** — `vault.excludeDotfiles`, `vault.excludeDotfilePattern`, `vault.excludeBlocked`, `vault.gitIgnore`. Each independently toggleable at runtime. Settings reference: [README.md § Vault](packages/vscode/README.md#vault).
- **Sub-path exclusion** — computed via mount tree (`packages/core/src/mount-tree.ts`). Controlled by `workspace.excludeUnmountedFolders`.
- **File-level exclusion** — regex on basenames generates `{prefix}/*{ext}` globs in the folder-scoped `files.exclude` tier. Gated by `workspace.excludeUnmountedFiles` toggle.
- **Vault write protection** — `vault.mode` controls `obs://` writes (`"ro"` → `isReadonly: true`; `"partial"` → autoMount-scoped enforcement). The `file://` workspace folder bypasses the provider. Limitations: [README.md § Workspace Folder](packages/vscode/README.md#workspace-folder).
- **`obs://` FileSystemProvider** — registered for tree view, wikilinks, drag-and-drop, watch events; does not back a workspace folder.
- **`FileSearchProvider`/`TextSearchProvider`** — proposed (unstable) as of `@types/vscode@1.118.0`. Do not use while proposed. Details: [README.md § Workspace Folder](packages/vscode/README.md#workspace-folder).

## Documentation

Update the package's README and CONTRIBUTING.md when changes affect user-facing behavior or API surface. Link, don't duplicate.
