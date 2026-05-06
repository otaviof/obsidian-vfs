# `AGENTS.md`

## Project

Obsidian VFS, a virtual file-system to share Obsidian notes into VSCode and Claude Code.

## Architecture

- **`packages/core`**: `obs://` URI resolution, LRU cache, `ObsidianCLI` wrapper, `node:fs` reads, `parseMarkdownLinks` parser for `[[wikilinks]]`/`![[embeds]]`, `resolveEmbeds` transclusion. CLI calls serialized via async queue.
- **`packages/vscode`**: `FileSystemProvider` for `obs://`. Reads via disk, mutations via CLI. Commands: mount/unmount folders, open in Obsidian, search notes. Auto-mount from settings, status bar, wikilink navigation via `DocumentLinkProvider`. CJS output, ESM source.
- **`packages/claude-plugin`**: Agent SDK plugin. `UserPromptSubmit` hook resolves `@obs:` (context) and `/obs:` (skill-only) mentions into `additionalContext`. Exports `obs-read-main.ts` for `bin/obs-read`.
- **`packages/cli`**: `npx obsidian-vfs`: `inspect`, `resolve`, `list-skills`, `provision-skills`, `list-agents`, `provision-agents`.
- **`bin/`**: Shebanged scripts on Claude Code PATH. `obs-read` resolves vault mentions; `obs-hook-handler` wraps the hook handler.

No cross-dependencies between `vscode`, `claude-plugin`, `cli`. Use the package `core` for shared resources.

## Toolchain

TypeScript 6 strict, ESM-only (`"type": "module"`) | pnpm 11 workspaces, Node 22+ | ESLint 10 flat config + Prettier (printWidth: 101) | Vitest 4.x | `module`/`moduleResolution`: `"nodenext"`

## Ignore Patterns

Shared ignores across `.gitignore`, `.prettierignore`, `eslint.config.ts`: `node_modules/`, `dist/`, `coverage/`. When adding generated/vendored directories, add to all three files.

## Build & Verification

| Command | Action |
|---------|--------|
| `pnpm install` | Install deps |
| `pnpm run ci` | lint + build + test |
| `pnpm run lint` | ESLint |
| `pnpm run build` | `tsc -b` |
| `pnpm test` | Vitest |
| `pnpm run format` | Prettier fix |
| `pnpm run format:check` | Prettier verify |
| `pnpm reset` | Wipe and reinstall `node_modules` |

**Do NOT run bare `pnpm ci`** -- that is pnpm's clean-install and wipes `node_modules`. Use `pnpm run ci`.

## Conventions

### Style

- **Small composable functions**: one responsibility each; prefer many small units over few large ones.
- **DRY**: extract shared logic to the lowest common package.
- **Explicit over implicit**: no barrel re-exports, no magic defaults.
- **Simplest wins**: fewest abstractions, most readable.

### Patterns

- **Result types**: return `VFSResult<T>` (ok/error union), never nulls.
- **CLI parsing**: `search`/`backlinks` return JSON; `vault`/`files`/`folders`/`read` return plain text. Exit code always 0. Detect errors via `Error:` stdout prefix.
- **Reads bypass CLI**: `readVirtualFile` uses `node:fs` directly.
- **Mutations through CLI**: `create`, `rename`, `move`, `delete` via CLI to preserve wikilinks.
- **Degraded mode** (Obsidian not running): reads/enumeration via `node:fs`; search, wikilinks, mutations unavailable.
- **Security**: `path.resolve` + vault-root prefix check on all I/O. Reject symlinks outside vault. `allowedFolders` enforced on all operations.
- **VSCode plugin versioning**: bump `version` in `packages/vscode/package.json` following semver when changing plugin code. Patch for fixes, minor for new features, major for breaking changes.

### File layout

- **JSDoc**: one-sentence `/** */` on every export (classes, interfaces, types, functions, methods).
- **Top-level constants**: after imports, each with `/** */` comment.
- **Function ordering**: helpers before callers; exported functions at bottom.
