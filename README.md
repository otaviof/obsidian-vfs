<p align="center">
  <img src="packages/vscode/obsidian-vfs.png" alt="Obsidian VFS" width="200" />
  <br>
  <br>
  <a href="https://www.npmjs.com/package/@obsidian-vfs/core"><img src="https://img.shields.io/npm/v/@obsidian-vfs/core?label=%40obsidian-vfs%2Fcore" alt="@obsidian-vfs/core"></a>
  <a href="https://www.npmjs.com/package/@obsidian-vfs/cli"><img src="https://img.shields.io/npm/v/@obsidian-vfs/cli?label=%40obsidian-vfs%2Fcli" alt="@obsidian-vfs/cli"></a>
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
  "agentsDirs": ["path/to/agents"],
  "skillsDirs": ["path/to/skills"],
  "allowedFolders": ["folder-a", "folder-b"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `agentsDirs` | `string[]` | Vault-relative folders containing agent definitions (flat `.md` files) |
| `skillsDirs` | `string[]` | Vault-relative folders containing skill definitions (`name/SKILL.md`) |
| `allowedFolders` | `string[]` | Restrict all read operations to these vault-relative folders. Empty = full vault access |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, scripts, architecture, and coding conventions.
