# Contributing

## Prerequisites

- Node.js 22+
- pnpm 11
- [Obsidian](https://obsidian.md) installed with a vault open
- The `obsidian` CLI on your PATH (or configured via `OBSIDIAN_VFS_CLI_PATH`)

## Setup

```sh
git clone https://github.com/otaviof/obsidian-vfs.git
cd obsidian-vfs
pnpm install
pnpm build
pnpm test
```

## Toolchain

TypeScript 6 strict, ESM-only (`"type": "module"`) | pnpm 11 workspaces, Node 22+ | ESLint 10 flat config + Prettier (printWidth: 101) | Vitest 4.x | `module`/`moduleResolution`: `"nodenext"`

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages (`tsc -b`) |
| `pnpm test` | Run tests (Vitest) |
| `pnpm run ci` | Full check: lint, build, test (in sequence) |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format with Prettier |
| `pnpm format:check` | Check formatting without writing |
| `pnpm package:vscode` | Build + package VS Code extension (`.vsix`) |
| `pnpm cli` | Run the CLI (after building) |
| `pnpm audit` | Check dependencies for known vulnerabilities |
| `pnpm reset` | Wipe and reinstall `node_modules` |

**Do NOT run bare `pnpm ci`** — that is pnpm's clean-install and wipes `node_modules`. Use `pnpm run ci`.

## Architecture

The consumer packages (`vscode`, `claude-plugin`, `cli`) depend on `core` but have no cross-dependencies between each other. Shared logic belongs in `packages/core`.

| Package | Entry point | Output |
|---------|-------------|--------|
| `packages/core` | `src/index.ts` | ESM (`dist/`) |
| `packages/vscode` | `src/extension.ts` | CJS via esbuild (`dist/extension.js`) |
| `packages/claude-plugin` | `src/hook-handler.ts` | ESM (`dist/`) |
| `packages/cli` | `src/main.ts` | ESM (`dist/main.js`) |

## Conventions

### Style

- **Small composable functions** — one responsibility each; prefer many small units over few large ones.
- **DRY** — extract shared logic to the lowest common package.
- **Explicit over implicit** — no barrel re-exports, no magic defaults.
- **Simplest wins** — fewest abstractions, most readable.

### Patterns

- **Result types** — return `VFSResult<T>` (ok/error union), never nulls.
- **CLI parsing** — `search`/`backlinks` return JSON; `vault`/`files`/`folders`/`read` return plain text. Exit code always 0. Detect errors via `Error:` stdout prefix.
- **Reads bypass CLI** — `readVirtualFile` uses `node:fs` directly.
- **Degraded mode** (Obsidian not running) — reads/enumeration via `node:fs`; search, wikilinks unavailable.
- **Security** — `path.resolve` + vault-root prefix check on all I/O. Reject symlinks outside vault. `allowedFolders` enforced on all operations.

### File Layout

- **JSDoc** — one-sentence `/** */` on every export (classes, interfaces, types, functions, methods).
- **Top-level constants** — after imports, each with `/** */` comment.
- **Function ordering** — helpers before callers; exported functions at bottom.

### Ignore Patterns

Shared ignores across `.gitignore`, `.prettierignore`, `eslint.config.ts`: `node_modules/`, `dist/`, `coverage/`. When adding generated/vendored directories, add to all three files.

### Versioning

Bump `version` in `packages/vscode/package.json` following semver when changing extension code. Patch for fixes, minor for new features, major for breaking changes.

## Developing the Claude Plugin

Rebuild after changes — Claude Code picks up the new `dist/` on the next prompt:

```sh
pnpm build
# Next prompt in Claude Code uses the updated hook handler
```

To load the plugin during development:

```sh
claude --plugin-dir .
```

## Developing the VS Code Extension

Build and package the extension:

```sh
pnpm package:vscode
code --install-extension packages/vscode/obsidian-vfs.vsix
```

Reload the window after installing (**Developer: Reload Window**).
