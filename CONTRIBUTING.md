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
| `packages/claude-plugin` | `src/hook-handler.ts` | ESM (`dist/`) + self-contained bundle (`bundle/hook-handler.mjs`) |
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

### Publishing to npm

Manual workflow:

1. Bump versions in `packages/core/package.json` and `packages/cli/package.json` (must match).
2. Run `pnpm run ci` — lint, build, test must pass.
3. `cd packages/core && npm publish --access public`
4. `cd packages/cli && npm publish --access public`
5. Verify: `npx @obsidian-vfs/cli@<version> --help`

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

The `UserPromptSubmit` hook runs via `bin/obs-hook-handler`, which imports the **bundled** entry point at `packages/claude-plugin/bundle/hook-handler.mjs`. This self-contained ESM file (produced by esbuild) inlines all dependencies — including `@obsidian-vfs/core` — so marketplace installs (git clone) work without `node_modules` or a build step.

- `bundle/` is tracked in git (not gitignored); `dist/` is not.
- `pnpm build` produces both `dist/` (for tests and local dev) and `bundle/` (for distribution).
- For local development, `settings.local.json` can override the hook path to point at the unbundled `dist/` output.

## Developing the VS Code Extension

Build and package the extension:

```sh
pnpm package:vscode
code --install-extension packages/vscode/obsidian-vfs.vsix
```

Reload the window after installing (**Developer: Reload Window**).
