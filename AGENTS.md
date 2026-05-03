# `AGENTS.md`

This file provides guidance to agents when working with code in this repository.

## Project

Obsidian VFS, is read-only `obs://` protocol exposing an Obsidian vault. Three entrypoints over a shared core engine.

## Architecture

- **`packages/core`** — Resolves `obs://` URIs, LRU cache, Obsidian CLI wrapper (`ObsidianCLI`), file reads via `node:fs`. CLI calls serialized (one subprocess at a time).
- **`packages/vscode`** — `FileSystemProvider` for `obs://`. Reads->disk, mutations->CLI. CJS output, ESM source.
- **`packages/claude-plugin`** — Agent SDK plugin. `UserPromptSubmit` hook resolves `@obs:` (context) and `/obs:` (skill-only) mentions into `additionalContext`. Can be loaded via `--plugin-dir` or via a settings hook (see README).
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

## Build & Verification

- **Install**: `pnpm install` (run after any `node_modules` wipe; `shamefully-hoist=false` in `.npmrc`)
- **Full CI**: `pnpm run ci` runs `pnpm lint && pnpm build && pnpm test`
- **Lint**: `pnpm run lint` (eslint via workspace script, not `npx eslint`)
- **Build**: `pnpm run build` (runs `tsc -b` via workspace)
- **Test**: `pnpm test` (vitest)
- **Format**: `pnpm run format` to fix, `pnpm run format:check` to verify
- **Caution**: Do NOT run bare `pnpm ci` — that is pnpm's clean-install command which wipes `node_modules`. Use `pnpm run ci` instead.
- **Recovery**: If `node_modules` gets wiped, run `pnpm reset` to clean and reinstall from scratch (pnpm may report "Already up to date" on a plain `pnpm install` otherwise).

## Conventions

- **Small, composable pieces** — Extract logic into small, focused functions that do one thing. Build features by composing these pieces incrementally. Prefer many small, reusable units over fewer large ones; each function, type, or module should be independently understandable and testable.
- **DRY** — Never duplicate code. Extract shared logic into the lowest common package and import it everywhere needed. If two files contain the same pattern, refactor into one reusable function or type.
- **Explicit over implicit** — Name things clearly, export intentionally, import precisely. No barrel re-exports that hide origin. No magic defaults that require reading source to understand.
- **Simplest wins** — Choose the most direct, readable solution. Fewer abstractions, fewer indirections, fewer tokens. If a helper doesn't earn its keep, inline it.
- **Result types** — Return `VFSResult<T>` (ok/error discriminated union), never nulls.
- **CLI serialization** — One subprocess at a time via async queue.
- **CLI parsing** — `search`/`backlinks` return JSON; `vault`/`files`/`folders`/`read` return plain text. Exit code always 0. Detect errors via `Error:` stdout prefix. Per-command parsers required.
- **Reads bypass CLI** — `readVirtualFile` uses `node:fs` directly.
- **Mutations through CLI** — `create`, `rename`, `move`, `delete` via CLI to preserve wikilinks.
- **Degraded mode** (Obsidian not running) — reads and enumeration work via `node:fs`; search, wikilink resolution, mutations unavailable.
- **Security** — `path.resolve` + vault-root prefix check on all I/O. Reject symlinks outside vault. `allowedFolders` enforced on all operations including plugin context injection.
- **JSDoc** — Every exported class, interface, type, and function must have a `/** … */` comment. Keep it to one sentence describing *what*, not *how*. Exported methods on classes/interfaces also require a one-line `/** … */`.
- **Top-level constants** — Define constants and module-level variables at the top of each TypeScript file, immediately after imports. Each must have a `/** … */` comment explaining its purpose.
- **Function ordering** — Define helper functions before the functions that call them. If `Z` calls `A`, `B`, and `C`, place them in the order they are invoked (`A`, `B`, `C`, then `Z`). The most important/exported functions sit at the bottom of the file; simpler building-block functions rise to the top.
