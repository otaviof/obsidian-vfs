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

## Documentation

Update the package's README and CONTRIBUTING.md when changes affect user-facing behavior or API surface. Link, don't duplicate.