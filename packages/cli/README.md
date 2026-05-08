# @obsidian-vfs/cli

Command-line interface for inspecting, resolving, and provisioning Obsidian vault resources. Provides diagnostics and automation for vault content, skills, and agents.

## Usage

From the workspace root (after building):

```sh
pnpm build
pnpm cli --help
```

Or directly via the compiled binary:

```sh
npx obsidian-vfs --help
```

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output |
| `--verbose`, `-v` | Timing diagnostics |
| `--description` | Show descriptions (list-skills, list-agents) |
| `--timeout <ms>` | CLI operation timeout (default: 10 000 ms) |
| `--help`, `-h` | Show usage information |

## Commands

### `resolve`

Resolve a wikilink, vault-relative path, or `/obs:` skill to its vault path.

```sh
pnpm cli resolve "Project Plan"
pnpm cli resolve "[[Project Plan]]"
pnpm cli resolve "/obs:obsidian"
pnpm cli resolve "Note" --json
```

Uses the Obsidian CLI's `search` with `file:<name>` to find candidates, then picks the exact basename match. When multiple files share the same basename, the shortest vault-relative path wins. This differs from the raw search order — Obsidian's search returns results in its own relevance ranking, which may place partial matches before exact ones.

### `inspect`

Inspect a mention — shows resolved path, target type, and content.

```sh
pnpm cli inspect "architect"
pnpm cli inspect "10-projects/plan.md#Architecture"
pnpm cli inspect "/obs:obsidian"
```

| Flag | Description |
|------|-------------|
| `--body` | Output only the raw content body (no metadata headers, no truncation) |
| `--full` | Show full content without truncation |

### `list-skills`

Enumerate all skills discovered from the vault's `skillsDirs` (configured in `.obsidian/obsidian-vfs.json`).

```sh
pnpm cli list-skills
pnpm cli list-skills --description
pnpm cli list-skills --json
```

Output is compact by default (name and vault-relative path only). Pass `--description` to include the description column.

### `list-agents`

Enumerate all agents discovered from the vault's `agentsDirs`.

```sh
pnpm cli list-agents
pnpm cli list-agents --description
pnpm cli list-agents --json
```

Output is compact by default (name and vault-relative path only). Pass `--description` to include the description column.

### `provision-skills`

Generate thin proxy files under `.claude/skills/` that Claude Code treats as native skills. Each proxy contains a `!`command`` directive that fetches live content from the vault at invocation time.

```sh
pnpm cli provision-skills
pnpm cli provision-skills --dry-run
pnpm cli provision-skills --include deploy --include review
pnpm cli provision-skills --exclude "draft-*"
pnpm cli provision-skills --json
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview without writing |
| `--include <glob>` | Only provision matching skills (repeatable) |
| `--exclude <glob>` | Skip matching skills (repeatable) |

#### Why proxy skills?

Obsidian vault skills live outside the project directory. Claude Code only discovers skills from `.claude/skills/` (project-level), `~/.claude/skills/` (personal), or a plugin's `skills/` directory — it has no mechanism to reach into an arbitrary vault path, and there is no API for dynamically registering skills at runtime.

The Claude plugin's `@obs:` hook can inject vault content via `additionalContext`, but content delivered this way is treated as passive context, not as an actionable skill. It lacks the full native skill lifecycle:

| Feature | Native skill | `additionalContext` |
|---------|-------------|---------------------|
| `/` autocomplete | Listed with description | Not listed |
| `$ARGUMENTS` substitution | Automatic | Not available |
| `context: fork` (subagent isolation) | Supported | Not available |
| Compaction survival | Re-attached (5K tokens each, 25K budget) | Dropped |
| `allowed-tools` (pre-authorized permissions) | Supported | Not available |
| Model/effort override | Via frontmatter | Not available |
| Live change detection | Watched directories | N/A |

Provisioning bridges this gap: it generates thin proxy files that Claude Code discovers natively, while the actual content is fetched live from the vault.

#### How proxies work

Each proxy contains a `!`command`` directive pointing to `./bin/obs-read`:

```markdown
---
name: deploy
description: Deploy helper
---

!`./bin/obs-read "/obs:deploy"`
```

The proxy lives at `.claude/skills/deploy/SKILL.md`. When invoked, the `!`command`` preprocessor runs `obs-read`, which bootstraps the core tracker, resolves the skill from the vault, and outputs content to stdout. Claude receives this as the skill body with full native lifecycle: frontmatter metadata, autocomplete, forked context, compaction survival.

#### Why `./bin/obs-read` (relative path)

- **No `${}` expansions.** The `!`command`` preprocessor blocks shell variable expansions, so the command must use a relative path from the project root.
- **No plugin PATH in preprocessor.** Plugin `bin/` directories are on PATH for Claude's Bash tool at runtime, but the `!`command`` preprocessor runs without plugin `${PATH}`.
- **Explicit permissions required.** Each `!`command`` needs an allow rule in `.claude/settings.local.json`. The command generates per-skill rules like `Bash(./bin/obs-read "/obs:deploy")` automatically.

#### Behavior

- Enumerates every `skillsDir` in `.obsidian/obsidian-vfs.json`, finds subdirectories containing `SKILL.md`, extracts frontmatter, and writes proxy files.
- Writes are idempotent — identical proxies are skipped.
- Skill names validated against `/^[a-zA-Z0-9._-]+$/`; shell metacharacters rejected.
- When multiple `skillsDirs` contain a skill with the same name, the first directory wins.
- Add-only — never removes proxy files or permission rules. Delete `.claude/skills/<name>/` and the corresponding rule from `.claude/settings.local.json` manually.
- When a filter is active (`--include`/`--exclude`), unmatched skills appear as `skipped` but existing proxies are never removed.

### `provision-agents`

Generate proxy agent files under `.claude/agents/`.

Unlike skill proxies, agent proxies write the **full vault content** at provisioning time. This is a Claude Code platform constraint: the `!`command`` preprocessing that enables live content loading is a `SKILL.md`-only feature — it does not work in agent files. An agent file containing `` !`command` `` produces the literal text, not the command output.

Two workarounds exist for dynamic content in agents:

1. **Write full content at generation time** (what this command does) — `[[wikilinks]]` are scrubbed to `obs://` URIs so Claude can follow them via `obs-read` at runtime.
2. **Preload a skill** via the `skills` frontmatter field — the skill _can_ use `!`command``, and its rendered content is injected into the agent's context at startup.

```sh
pnpm cli provision-agents
pnpm cli provision-agents --dry-run
pnpm cli provision-agents --include architect --include reviewer
pnpm cli provision-agents --exclude "draft-*"
pnpm cli provision-agents --json
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview without writing |
| `--include <glob>` | Only provision matching agents (repeatable) |
| `--exclude <glob>` | Skip matching agents (repeatable) |

#### Agent vs. skill proxies

| Aspect | `provision-skills` | `provision-agents` |
|--------|--------------------|--------------------|
| Output format | `.claude/skills/<name>/SKILL.md` (directory) | `.claude/agents/<name>.md` (flat file) |
| Body mechanism | `!`command`` loads fresh content per session | Full content written at provisioning time |
| Frontmatter | Minimal (name + description) | All fields forwarded from vault |
| Wikilink scrubbing | At runtime by `obs-read` | At provisioning time by CLI |
| Permissions | Per-skill `Bash(./bin/obs-read ...)` | Single global `Bash(obs-read *)` |
| Content freshness | Always current | Stale until re-provisioned |

Same add-only behavior as skills. Delete `.claude/agents/<name>.md` manually to remove a deprovisioned agent.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OBSIDIAN_CLI_PATH` | Path to the Obsidian CLI binary | `"obsidian"` |
| `OBSIDIAN_VFS_TIMEOUT_MS` | CLI operation timeout in milliseconds | `10000` |

The `--timeout` flag overrides `OBSIDIAN_VFS_TIMEOUT_MS`. To use a custom CLI binary path, set `OBSIDIAN_CLI_PATH`.

For upstream Claude Code documentation on skills, agents, hooks, and plugins, see the [Claude plugin README](../claude-plugin/README.md#claude-code-documentation).
