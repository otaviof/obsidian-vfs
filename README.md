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

## CLI (Development)

During development, run the CLI via the root workspace script after building:

```sh
pnpm build
pnpm cli --help
```

The vault is discovered automatically by the Obsidian CLI:

```sh
# Resolve a wikilink to its vault path
pnpm cli resolve "Project Plan"
pnpm cli resolve "[[Project Plan]]"

# Inspect an @obs: mention (shows resolved path, target type, and content)
pnpm cli inspect "architect"
pnpm cli inspect "10-projects/plan.md#Architecture"

# Machine-readable output
pnpm cli resolve "Note" --json

# Timing diagnostics
pnpm cli inspect "agent" --verbose
```

Use `--cli-path` if the `obsidian` binary is not on your `PATH`, and `--timeout` to adjust the CLI timeout (default 10 000 ms).

### Wikilink Resolution

The `resolve` command uses the Obsidian CLI's `search` with `file:<name>` to find candidates, then picks the exact basename match. This differs from the raw search order — Obsidian's search returns results in its own relevance ranking, which may place partial matches before exact ones. For example, `file:system` may return `["Landscaper vs. System Testing.md", "system.md", "base-system.md"]`, but `resolve` selects `system.md` because its basename matches exactly. When multiple files share the same basename, the shortest vault-relative path wins.

## Vault Configuration

Place a JSON file at `.obsidian/obsidian-vfs.json` inside your vault to configure the VFS. All fields are optional and default to empty arrays:

```json
{
  "agentsDirs": ["30-resources/ai/staff"],
  "skillsDirs": ["30-resources/ai/skills"],
  "allowedFolders": ["10-projects", "20-areas", "30-resources"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `agentsDirs` | `string[]` | Vault-relative folders containing agent definitions. Used by `inspect` to resolve agent mentions. |
| `skillsDirs` | `string[]` | Vault-relative folders containing skill definitions. Used by `inspect` to resolve skill mentions. |
| `allowedFolders` | `string[]` | Restrict all read operations to these vault-relative folders. Empty means no restriction (full vault access). |

If the file is missing or empty (`{}`), the VFS operates with defaults (no agent/skill directories, full vault access).

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
