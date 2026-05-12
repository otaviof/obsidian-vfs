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
| `pnpm check:bundles` | Verify tracked Claude plugin bundles match build output |
| `pnpm check:versions:npm` | Verify core/cli versions match |
| `pnpm check:versions:vscode` | Print VS Code extension version |
| `pnpm check:published:npm` | Check if npm packages need publishing |
| `pnpm check:published:vscode` | Check if VS Code extension needs publishing |
| `pnpm publish:vscode` | Publish VS Code extension to marketplace (requires `VSCE_PAT`) |
| `pnpm reset` | Wipe and reinstall `node_modules` |

**Do NOT run bare `pnpm ci`** — that is pnpm's clean-install and wipes `node_modules`. Use `pnpm run ci`.

## Architecture

The consumer packages (`vscode`, `claude-plugin`, `cli`) depend on `core` but have no cross-dependencies between each other. Shared logic belongs in `packages/core`.

| Package | Entry point | Output |
|---------|-------------|--------|
| `packages/core` | `src/index.ts` | ESM (`dist/`) |
| `packages/vscode` | `src/extension.ts` | CJS via esbuild (`dist/extension.js`) |
| `packages/claude-plugin` | `src/hook-handler.ts`, `src/entry-expansion.ts`, `src/entry-subagent.ts` | ESM (`dist/`) + self-contained bundles (`bundle/*.mjs`) |
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

Shared ignores across `.gitignore`, `.prettierignore`, `eslint.config.ts`: `node_modules/`, `dist/`, `coverage/`. When adding generated/vendored directories, add to all three files. Exception: `bundle/` is ignored by ESLint and Prettier but **not** `.gitignore` — it must be tracked in git for marketplace installs.

### Versioning

**npm packages** (`@obsidian-vfs/core`, `@obsidian-vfs/cli`): share a single version, bumped in lockstep. Patch for fixes, minor for new features, major for breaking changes. The `cli` depends on `core` via `workspace:^` (pnpm converts to `^x.y.z` at publish time).

**VSCode extension** (`packages/vscode/package.json`): independent version following semver.

**Claude plugin** (`plugin.json`): independent version tracking marketplace releases. The plugin stays `private: true` — it is not published to npm.

### Publishing

1. Bump versions in the relevant `package.json` files (core + cli must match).
2. Merge to `main`.

The `publish.yml` workflow runs automatically on every push to `main`, detects which packages have unpublished versions, and publishes only those. If no versions changed, nothing is published.

To publish manually: `gh workflow run publish.yml`

## Developing the CLI

### Local provisioning

Set `OBSIDIAN_VFS_PROJECT_DIR` so provisioned skill proxies use `./bin/obs-read` instead of `npx`:

```sh
export OBSIDIAN_VFS_PROJECT_DIR=.
pnpm cli provision-skills
```

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

### Hook handler bundle

Three hook handlers run via `bin/obs-*` scripts, each importing a **bundled** entry point from `packages/claude-plugin/bundle/`. These self-contained ESM files (produced by esbuild) inline all dependencies — including `@obsidian-vfs/core` — so marketplace installs (git clone) work without `node_modules` or a build step.

| Hook event | Bin script | Bundle |
|------------|-----------|--------|
| `UserPromptSubmit` | `bin/obs-hook-handler` | `bundle/hook-handler.mjs` |
| `UserPromptExpansion` | `bin/obs-expansion-handler` | `bundle/entry-expansion.mjs` |
| `SubagentStart` | `bin/obs-subagent-handler` | `bundle/entry-subagent.mjs` |

- `bundle/` is tracked in git (not gitignored); `dist/` is not.
- `pnpm build` produces both `dist/` (for tests and local dev) and `bundle/` (for distribution).
- For local development, `settings.local.json` can override the hook paths to point at the unbundled `dist/` output.

## Developing the VS Code Extension

Build and package the extension:

```sh
pnpm package:vscode
code --install-extension packages/vscode/obsidian-vfs.vsix
```

Reload the window after installing (**Developer: Reload Window**).
