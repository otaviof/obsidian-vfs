# `AGENTS.md`

This file provides guidance to agents when working with code in this repository.

## Project

Obsidian VFS, is read-only `obs://` protocol exposing an Obsidian vault. Three entrypoints over a shared core engine.

## Architecture

- **`packages/core`** — Resolves `obs://` URIs, LRU cache, Obsidian CLI wrapper (`ObsidianCLI`), file reads via `node:fs`. CLI calls serialized (one subprocess at a time).
- **`packages/vscode`** — `FileSystemProvider` for `obs://`. Reads->disk, mutations->CLI. CJS output, ESM source.
- **`packages/claude-plugin`** — Agent SDK plugin. `UserPromptSubmit` hook resolves `@obs:` mentions into `additionalContext`.
- **`packages/cli`** — `npx obsidian-vfs` diagnostics: `inspect`, `resolve`, `status`.

No cross-dependencies between vscode, claude-plugin, cli.

## Toolchain

TypeScript 6 strict, ESM-only (`"type": "module"`) | pnpm 11 workspaces, Node 22+ | ESLint 10 flat config + Prettier (printWidth: 101) | Vitest 4.x | `module`/`moduleResolution`: `"nodenext"`

## Ignore Patterns

Three files control what each tool ignores. Each tool has its own config format, so patterns are intentionally duplicated — kept small and explicit rather than abstracted.

| File | Governs | Notable extras |
|------|---------|----------------|
| `.gitignore` | Git tracking | `*.tsbuildinfo` |
| `.prettierignore` | Prettier formatting | `*.md`, `*.tsbuildinfo`, `pnpm-lock.yaml` |
| `eslint.config.ts` (`ignores`) | ESLint linting | `**/*.d.ts` |

Shared across all three: `node_modules/`, `dist/`, `coverage/`.

When adding a new generated or vendored directory, add it to all three files.

## Conventions

- **Result types** — Return `VFSResult<T>` (ok/error discriminated union), never nulls.
- **CLI serialization** — One subprocess at a time via async queue.
- **CLI parsing** — `search`/`backlinks` return JSON; `vault`/`files`/`folders`/`read` return plain text. Exit code always 0. Detect errors via `Error:` stdout prefix. Per-command parsers required.
- **Reads bypass CLI** — `readVirtualFile` uses `node:fs` directly.
- **Mutations through CLI** — `create`, `rename`, `move`, `delete` via CLI to preserve wikilinks.
- **Degraded mode** (Obsidian not running) — reads and enumeration work via `node:fs`; search, wikilink resolution, mutations unavailable.
- **Security** — `path.resolve` + vault-root prefix check on all I/O. Reject symlinks outside vault. `allowedFolders` enforced on all operations including plugin context injection.
- **JSDoc** — Every exported class, interface, type, and function must have a `/** … */` comment. Keep it to one sentence describing *what*, not *how*. Exported methods on classes/interfaces also require a one-line `/** … */`.
