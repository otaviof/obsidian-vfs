# `AGENTS.md`

## Project

Obsidian VFS, a virtual file-system to share Obsidian notes into VSCode and Claude Code.

## Architecture

No cross-dependencies between `vscode`, `claude-plugin`, `cli`. Use the package `core` for shared resources. Entry points and output formats: [CONTRIBUTING.md#architecture](CONTRIBUTING.md#architecture).

## Build & Verification

**Do NOT run bare `pnpm ci`** -- that is pnpm's clean-install and wipes `node_modules`. Use `pnpm run ci`.

Toolchain, scripts, and development workflows: [CONTRIBUTING.md#toolchain](CONTRIBUTING.md#toolchain), [CONTRIBUTING.md#scripts](CONTRIBUTING.md#scripts).

## Conventions

### Style & File Layout

- **Small composable functions**: one responsibility each; prefer many small units over few large ones.
- **DRY**: extract shared logic to the lowest common package.
- **Explicit over implicit**: no barrel re-exports, no magic defaults.
- **Simplest wins**: fewest abstractions, most readable.
- **JSDoc**: one-sentence `/** */` on every export (classes, interfaces, types, functions, methods).
- **Top-level constants**: after imports, each with `/** */` comment.
- **Function ordering**: helpers before callers; exported functions at bottom.

### Patterns

- **Result types**: return `VFSResult<T>` (ok/error union), never nulls.
- **CLI parsing**: `search`/`backlinks` return JSON; `vault`/`files`/`folders`/`read` return plain text. Exit code always 0. Detect errors via `Error:` stdout prefix.
- **Reads bypass CLI**: `readVirtualFile` uses `node:fs` directly.
- **Degraded mode** (Obsidian not running): reads/enumeration via `node:fs`; search, wikilinks unavailable.
- **Security**: `path.resolve` + vault-root prefix check on all I/O. Reject symlinks outside vault. Use `allowedFolders` enforced on all operations.
- **Claude and VSCode plugin versioning**: bump `version` in `packages/claude-plugin/package.json` and `packages/vscode/package.json` following semver when changing plugin code. 
- **NPM package versioning**: bump `version` in `packages/core/package.json` and `packages/cli/package.json` following semver when changing published code.

## Documentation

When modifying code, update the corresponding documentation if the change affects user-facing behavior, commands, settings, or API surface. Do not duplicate content across files -- link instead.

- [CONTRIBUTING.md#architecture](CONTRIBUTING.md#architecture) -- entry points, output formats
- [CONTRIBUTING.md#conventions](CONTRIBUTING.md#conventions) -- full style, patterns, versioning
- [packages/core/README.md](packages/core/README.md) -- API surface, exports
- [packages/vscode/README.md](packages/vscode/README.md) -- commands, settings
- [packages/claude-plugin/README.md](packages/claude-plugin/README.md) -- mention syntax, provisioning rationale
- [packages/cli/README.md](packages/cli/README.md) -- CLI commands, flags, environment variables
