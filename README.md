# Obsidian VFS

Read-only virtual filesystem exposing an [Obsidian](https://obsidian.md) vault via the `obs://` protocol. Three entrypoints — a VS Code extension, a Claude plugin, and a CLI — built on a shared core engine.

## Packages

| Package | Description |
|---------|-------------|
| `packages/core` | `obs://` URI resolution, LRU cache, Obsidian CLI wrapper, direct file reads via `node:fs` |
| `packages/vscode` | VS Code `FileSystemProvider` for `obs://` — reads from disk, mutations through CLI |
| `packages/claude-plugin` | Agent SDK plugin resolving `@obs:` and `/obs:` mentions into context via `UserPromptSubmit` hook |
| `packages/cli` | `npx obsidian-vfs` diagnostics and provisioning — `inspect`, `resolve`, `list-skills`, `provision-skills`, `list-agents`, `provision-agents` |

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
# Resolve a wikilink or /obs: skill to its vault path
pnpm cli resolve "Project Plan"
pnpm cli resolve "[[Project Plan]]"
pnpm cli resolve "/obs:obsidian"

# Inspect an @obs: or /obs: mention (shows resolved path, target type, and content)
pnpm cli inspect "architect"
pnpm cli inspect "10-projects/plan.md#Architecture"
pnpm cli inspect "/obs:obsidian"

# Output only the raw content body (no metadata headers, no truncation)
pnpm cli inspect "/obs:deploy" --body

# Machine-readable output
pnpm cli resolve "Note" --json

# Timing diagnostics
pnpm cli inspect "agent" --verbose
```

Use `--cli-path` if the `obsidian` binary is not on your `PATH`, and `--timeout` to adjust the CLI timeout (default 10 000 ms).

### Listing Vault Skills

Enumerate all skills discovered from the vault's `skillsDirs`:

```sh
# Terminal table output
pnpm cli list-skills

# Machine-readable output
pnpm cli list-skills --json
```

### Provisioning Vault Skills

#### The problem

Obsidian vault skills live outside the project directory (e.g. `30-resources/ai/skills/deploy/SKILL.md`). Claude Code can only discover skills from project-level `.claude/skills/`, it has no mechanism to reach into an arbitrary vault path. The Claude plugin's `@obs:` hook can inject vault content at prompt time via `additionalContext`, but that path lacks native skill features: no `/` autocomplete, no `context: fork`, no compaction re-attachment, no `$ARGUMENTS`. Content injected through `additionalContext` is treated as passive context, not actionable instructions.

#### The approach

The subcommand `provision-skills` generates thin proxy files that Claude Code treats as native skills. Each proxy contains a "!`command`" directive that fetches live content from the vault at invocation time via `obs-read`:

```
---
name: deploy
description: Deploy helper
---

!`./bin/obs-read "/obs:deploy"`
```

The proxy lives at `.claude/skills/deploy/SKILL.md` — a project-level path that Claude Code discovers natively. When the skill is invoked, the `!`command`` preprocessor runs `obs-read`, which bootstraps the core tracker, resolves the skill from the vault's `skillsDirs`, and outputs the content to stdout. Claude receives this as the skill body with full native lifecycle: frontmatter metadata, autocomplete, forked context, compaction survival.

The proxies are placed at `.claude/skills/` (project-level) rather than the plugin's `skills/` directory. Plugin skills get namespaced (`/obsidian-vfs:skill-name`), while project-level skills get bare names (`/skill-name`) with live change detection.

#### Why "!`command`" with `./bin/obs-read`

Several constraints dictate the specific mechanism:

- **No `${}` expansions.** The `!`command`` preprocessor blocks shell variable expansions like `${CLAUDE_PLUGIN_ROOT}`, so the command must use a relative path from the project root.
- **No plugin PATH in preprocessor.** Plugin `bin/` directories are on PATH for Claude's Bash tool at runtime, but the "!`command`" preprocessor runs in a separate shell context without plugin `${PATH}`. The proxy must use `./bin/obs-read` (relative from CWD), not bare `obs-read`.
- **Explicit permissions required.** Each "!`command`" needs an allow rule in `.claude/settings.local.json`. The command generates per-skill rules like `Bash(./bin/obs-read "/obs:deploy")` automatically.

At runtime (after skill invocation), Claude follows wikilinks in skill content by calling bare `obs-read` via the Bash tool — this works because the plugin's `bin/` directory is on PATH in that context. The global `Bash(obs-read *)` permission covers these runtime calls.

#### Usage

```sh
# Generate proxy skills under .claude/skills/
pnpm cli provision-skills

# Preview without writing
pnpm cli provision-skills --dry-run

# Only provision specific skills (repeatable)
pnpm cli provision-skills --include deploy --include review

# Provision all except matching skills (repeatable)
pnpm cli provision-skills --exclude "draft-*"

# Machine-readable output
pnpm cli provision-skills --json
```

The `--include` and `--exclude` flags accept glob patterns (`*` and `?`) and are mutually exclusive. When a filter is active, skills that don't match appear in the `skipped` output but existing proxies and permissions for those skills are never removed.

The command enumerates every `skillsDir` configured in `.obsidian/obsidian-vfs.json`, finds subdirectories containing a `SKILL.md`, extracts frontmatter metadata, and writes proxy files. Writes are idempotent — if a proxy already exists with identical content, it is skipped. Skill names are validated against `/^[a-zA-Z0-9._-]+$/`; names with shell metacharacters are rejected. When multiple `skillsDirs` contain a skill with the same name, the first directory wins.

The command only adds — it never removes proxy files or permission rules. Proxies are cheap to regenerate, and accidental deletion of a manually-tweaked proxy or permission rule is more disruptive than a stale file on disk. To remove a deprovisioned skill, delete its `.claude/skills/<name>/` directory and the corresponding rule from `.claude/settings.local.json` manually.

### Listing Vault Agents

Enumerate all agents discovered from the vault's `agentsDirs`:

```sh
# Terminal table output
pnpm cli list-agents

# Machine-readable output
pnpm cli list-agents --json
```

### Provisioning Vault Agents

The subcommand `provision-agents` generates proxy agent files under `.claude/agents/`. Unlike skill proxies (which use `!`command`` for dynamic content loading), agent proxies write the **full vault content** at provisioning time because `!`command`` preprocessing is a SKILL.md-only feature — it does not work in agent files.

All frontmatter from the vault source is forwarded verbatim (`tools`, `model`, `hooks`, `memory`, etc.), with `name` ensured from the filename. `[[wikilinks]]` in the body are converted to `obs://` URIs via `scrubWikilinks()` at provisioning time. At runtime, Claude follows these links via `obs-read`, so the progressive disclosure chain works at any depth.

| Aspect | `provision-skills` | `provision-agents` |
|--------|--------------------|--------------------|
| Output format | `.claude/skills/<name>/SKILL.md` (directory) | `.claude/agents/<name>.md` (flat file) |
| Body mechanism | `!`command`` loads fresh content per session | Full content written at provisioning time |
| Frontmatter | Minimal (name + description) | All fields forwarded from vault |
| Wikilink scrubbing | At runtime by `obs-read` | At provisioning time by CLI |
| Permissions | Per-skill `Bash(./bin/obs-read ...)` | Single global `Bash(obs-read *)` |
| Content freshness | Always current | Stale until re-provisioned |

```sh
pnpm cli provision-agents
pnpm cli provision-agents --dry-run
pnpm cli provision-agents --include architect --include reviewer
pnpm cli provision-agents --exclude "draft-*"
pnpm cli provision-agents --json
```

Same add-only behavior as skills. The command never removes proxy files or permission rules. To remove a deprovisioned agent, delete `.claude/agents/<name>.md` manually.

### Wikilink Resolution

The `resolve` command uses the Obsidian CLI's `search` with `file:<name>` to find candidates, then picks the exact basename match. This differs from the raw search order — Obsidian's search returns results in its own relevance ranking, which may place partial matches before exact ones. For example, `file:system` may return `["Landscaper vs. System Testing.md", "system.md", "base-system.md"]`, but `resolve` selects `system.md` because its basename matches exactly. When multiple files share the same basename, the shortest vault-relative path wins.

## Claude Plugin

The Claude Code plugin intercepts every `UserPromptSubmit` hook, scans for `@obs:` and `/obs:` mentions, resolves each through the vault, and injects the content as `additionalContext`.

### Usage

Two mention syntaxes are supported:

**`@obs:` — context mentions** resolve through the full chain: agents, skills, files, then wikilinks.

```
@obs:architect                     # Agent by name (from agentsDirs)
@obs:10-projects/plan.md           # File by vault-relative path
@obs:plan.md#Architecture          # Section within a file
```

**`/obs:` — skill mentions** always resolve as a skill. No fallback to agents, files, or wikilinks.

```
/obs:obsidian                      # Skill by name (from skillsDirs)
/obs:obsidian#Usage                # Section within a skill
```

Mentions inside fenced code blocks and inline code are ignored. Duplicate mentions are resolved once; `@obs:X` and `/obs:X` with the same name resolve independently. Failed resolutions appear as error messages in context rather than crashing.

### Installation

The plugin manifest lives at the repo root (`.claude-plugin/plugin.json`), so point `--plugin-dir` at the repo itself:

```sh
# Build the plugin (required before first use)
pnpm build

# Launch Claude Code with the plugin loaded
claude --plugin-dir /path/to/obsidian-vfs

# Or from within the repo
claude --plugin-dir .
```

For live development, rebuild after changes — Claude Code picks up the new `dist/` on the next prompt:

```sh
# Edit source in packages/claude-plugin/src/ or packages/core/src/
pnpm build
# Next prompt in Claude Code uses the updated hook handler
```

### Known issues

- **`IS_DEMO=1` disables hooks.** If this environment variable is set in `~/.claude/settings.json` (or exported), all hooks — including the `@obs:` resolver — are silently blocked. Remove it or set `IS_DEMO=0` to restore hook execution.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OBSIDIAN_VFS_CLI_PATH` | Path to the Obsidian CLI binary | `"obsidian"` |
| `OBSIDIAN_VFS_TIMEOUT_MS` | CLI operation timeout in milliseconds | `10000` |

Both variables are resolved by `resolveExecConfig()` in `packages/core`. They apply to all packages (core, cli, claude-plugin). Invalid values fall back to defaults silently.

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
| `agentsDirs` | `string[]` | Vault-relative folders containing agent definitions (flat `.md` files). Used by `inspect` to resolve agent mentions and by `provision-agents` to generate proxy agents. |
| `skillsDirs` | `string[]` | Vault-relative folders containing skill definitions (`name/SKILL.md`). Used by `/obs:` mentions and `@obs:` fallback. |
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
