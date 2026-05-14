<p align="center">
  <img src="packages/vscode/obsidian-vfs.png" alt="Obsidian VFS" width="200" />
  <br>
  <br>
  <a href="https://www.npmjs.com/package/@obsidian-vfs/core"><img src="https://img.shields.io/npm/v/@obsidian-vfs/core?label=%40obsidian-vfs%2Fcore" alt="@obsidian-vfs/core"></a>
  <a href="https://www.npmjs.com/package/@obsidian-vfs/cli"><img src="https://img.shields.io/npm/v/@obsidian-vfs/cli?label=%40obsidian-vfs%2Fcli" alt="@obsidian-vfs/cli"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=otaviof.obsidian-vfs"><img src="https://vsmarketplacebadges.dev/version/otaviof.obsidian-vfs.svg" alt="VSCode Extension"></a>
  <br>
  <a href="https://github.com/otaviof/obsidian-vfs/actions/workflows/ci.yml"><img src="https://github.com/otaviof/obsidian-vfs/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/otaviof/obsidian-vfs/actions/workflows/audit.yml"><img src="https://github.com/otaviof/obsidian-vfs/actions/workflows/audit.yml/badge.svg" alt="Audit"></a>
</p>

# Obsidian VFS

Read-only virtual filesystem exposing an [Obsidian](https://obsidian.md) vault via the `obs://` protocol. Three entrypoints — a VS Code extension, a Claude Code plugin, and a CLI — built on a shared core engine.

## Packages

| Package | Description | Docs |
|---------|-------------|------|
| [`packages/core`](packages/core/) | `obs://` URI resolution, LRU cache, Obsidian CLI wrapper, direct file reads via `node:fs` | [README](packages/core/README.md) |
| [`packages/vscode`](packages/vscode/) | VS Code `FileSystemProvider` for `obs://` — browse, search, and edit your vault in the editor | [README](packages/vscode/README.md) |
| [`packages/claude-plugin`](packages/claude-plugin/) | Claude Code plugin resolving `@obs:` and `/obs:` mentions into context via `UserPromptSubmit` hook | [README](packages/claude-plugin/README.md) |
| [`packages/cli`](packages/cli/) | `npx obsidian-vfs` — inspect, resolve, list, and provision vault skills and agents | [README](packages/cli/README.md) |

The consumer packages (`vscode`, `claude-plugin`, `cli`) depend on `core` but have no cross-dependencies between each other.

## Getting Started

```sh
pnpm install
pnpm build
pnpm test
```

## Vault Configuration

Place a JSON file at `.obsidian/obsidian-vfs.json` inside your vault. All fields are optional and default to empty arrays:

```json
{
  "agents": ["path/to/agents"],
  "skills": ["path/to/skills"],
  "allowed": ["folder-a", "folder-b"],
  "blocked": ["folder-a/private"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `agents` | `string[]` | Vault-relative directories containing agent definitions (flat `.md` files) |
| `skills` | `string[]` | Vault-relative directories containing skill definitions (`name/SKILL.md`) |
| `allowed` | `string[]` | Restrict general vault access to these directories. Empty = full vault access |
| `blocked` | `string[]` | Deny access to these directories (evaluated before `allowed`) |

### Two-Tier Access Model

`allowed` and `blocked` restrict general vault content — notes, wikilinks, directory browsing, and workspace mounts. `agents` and `skills` directories are implicitly allowed and exempt from these restrictions.

`blocked` is evaluated first (deny wins). When a path matches both `allowed` and `blocked`, it is blocked. A `blocked` entry may be a child of an `allowed` entry (carving an exception), but not a parent — that configuration is rejected at load time.

Wikilinks inside allowed notes that reference disallowed targets are visible but inert: the text remains, but the target cannot be resolved, read, or clicked.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, scripts, architecture, and coding conventions.
