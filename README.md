# Obsidian VFS

Read-only virtual filesystem exposing an [Obsidian](https://obsidian.md) vault via the `obs://` protocol. Three entrypoints — a VS Code extension, a Claude plugin, and a CLI — built on a shared core engine.

## Packages

| Package | Description |
|---------|-------------|
| `packages/core` | `obs://` URI resolution, LRU cache, Obsidian CLI wrapper, direct file reads via `node:fs` |
| `packages/vscode` | VS Code `FileSystemProvider` for `obs://` — reads from disk, mutations through CLI |
| `packages/claude-plugin` | Agent SDK plugin resolving `@obs:` mentions into context via `UserPromptSubmit` hook |
| `packages/cli` | `npx obsidian-vfs` diagnostics — `inspect`, `resolve`, `status` |

The consumer packages (`vscode`, `claude-plugin`, `cli`) depend on `core` but have no cross-dependencies between each other.

## Prerequisites

- Node.js 22+
- pnpm 11

## Getting Started

```sh
pnpm install
pnpm build
pnpm test
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format with Prettier |
| `pnpm format:check` | Check formatting without writing |
| `pnpm test` | Run tests (Vitest) |
| `pnpm ci` | Full check: lint, build, test (in sequence) |
| `pnpm audit` | Check dependencies for known vulnerabilities |
