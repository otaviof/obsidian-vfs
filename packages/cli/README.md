# @obsidian-vfs/cli

Command-line interface for inspecting, resolving, and provisioning Obsidian vault resources. Provides diagnostics and automation for vault content, skills, and agents.

## Installation

Run directly via npx (no install required):

```sh
npx @obsidian-vfs/cli --help
npx @obsidian-vfs/cli inspect "@obs:architect" --body
npx @obsidian-vfs/cli provision-skills
```

Or install globally:

```sh
npm install -g @obsidian-vfs/cli
obsidian-vfs --help
```

## Usage

From the workspace root (after building):

```sh
pnpm build
pnpm cli --help
```

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output |
| `--verbose`, `-v` | Timing diagnostics |
| `--description` | Show descriptions (list-skills, list-agents) |
| `--user` | Provision to `~/.claude/` (user-global) instead of `.claude/` (project-level) |
| `--help`, `-h` | Show usage information |

## Commands

### `resolve`

Resolve a wikilink, vault-relative path, or `/obs:` skill to its vault path.

```sh
npx @obsidian-vfs/cli resolve "Project Plan"
npx @obsidian-vfs/cli resolve "[[Project Plan]]"
npx @obsidian-vfs/cli resolve "/obs:obsidian"
npx @obsidian-vfs/cli resolve "Note" --json
```

Uses the Obsidian CLI's `search` with `file:<name>` to find candidates, then picks the exact basename match. When multiple files share the same basename, the shortest vault-relative path wins. This differs from the raw search order — Obsidian's search returns results in its own relevance ranking, which may place partial matches before exact ones.

### `inspect`

Inspect a mention — shows resolved path, target type, and content.

```sh
npx @obsidian-vfs/cli inspect "architect"
npx @obsidian-vfs/cli inspect "10-projects/plan.md#Architecture"
npx @obsidian-vfs/cli inspect "/obs:obsidian"
```

| Flag | Description |
|------|-------------|
| `--body` | Output only the raw content body (no metadata headers, no truncation) |
| `--full` | Show full content without truncation |

### `list-skills`

Enumerate all skills discovered from the vault's `skillsDirs` (configured in `.obsidian/obsidian-vfs.json`).

```sh
npx @obsidian-vfs/cli list-skills
npx @obsidian-vfs/cli list-skills --description
npx @obsidian-vfs/cli list-skills --json
```

Output is compact by default (name and vault-relative path only). Pass `--description` to include the description column.

### `list-agents`

Enumerate all agents discovered from the vault's `agentsDirs`.

```sh
npx @obsidian-vfs/cli list-agents
npx @obsidian-vfs/cli list-agents --description
npx @obsidian-vfs/cli list-agents --json
```

Output is compact by default (name and vault-relative path only). Pass `--description` to include the description column.

### `provision-skills`

Generate thin proxy files under `.claude/skills/` that Claude Code treats as native skills. Each proxy contains a `!`command`` directive that fetches live content from the vault at invocation time.

```sh
npx @obsidian-vfs/cli provision-skills
npx @obsidian-vfs/cli provision-skills --dry-run
npx @obsidian-vfs/cli provision-skills --include deploy --include review
npx @obsidian-vfs/cli provision-skills --exclude "draft-*"
npx @obsidian-vfs/cli provision-skills --pin
npx @obsidian-vfs/cli provision-skills --user
npx @obsidian-vfs/cli provision-skills --json
npx @obsidian-vfs/cli provision-skills --set model=opus
npx @obsidian-vfs/cli provision-skills --set model=claude-sonnet-4-6 --set allowed-tools=Bash
npx @obsidian-vfs/cli provision-skills --unset argument-hint
npx @obsidian-vfs/cli provision-skills --set model=opus --unset argument-hint
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview without writing |
| `--include <glob>` | Only provision matching skills (repeatable) |
| `--exclude <glob>` | Skip matching skills (repeatable) |
| `--pin` | Pin generated commands to the current CLI version |
| `--user` | Provision to `~/.claude/skills/` and `~/.claude/settings.json` instead of project-level |
| `--set <key=value>` | Override a frontmatter attribute (repeatable) |
| `--unset <key>` | Remove a frontmatter attribute (repeatable) |

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
| Model/effort override | Via frontmatter or `--set`/`--unset` | Not available |
| Live change detection | Watched directories | N/A |

Provisioning bridges this gap: it generates thin proxy files that Claude Code discovers natively, while the actual content is fetched live from the vault.

#### How proxies work

Each proxy contains a `!`command`` directive that fetches live vault content:

```markdown
---
name: deploy
description: Deploy helper
---

!`npx --yes @obsidian-vfs/cli inspect --body "/obs:deploy"`
```

The proxy lives at `.claude/skills/deploy/SKILL.md`. When invoked, the `!`command`` preprocessor runs the CLI's `inspect --body`, which bootstraps the core tracker, resolves the skill from the vault, and outputs content to stdout. Claude receives this as the skill body with full native lifecycle: frontmatter metadata, autocomplete, forked context, compaction survival.

By default, generated commands reference the package name without a version (`@obsidian-vfs/cli`), so they always resolve to the latest published version. Pass `--pin` to pin commands to the currently running CLI version (`@obsidian-vfs/cli@0.1.0`).

When `OBSIDIAN_VFS_PROJECT_DIR` is set, provisioning emits `./bin/obs-read` instead (see [Environment Variables](#environment-variables)).

#### Permissions

Provisioning adds a single generic allow rule to `.claude/settings.local.json`:

```
Bash(npx --yes @obsidian-vfs/cli inspect --body *)
```

When `--pin` is passed, the rule pins to the current CLI version:

```
Bash(npx --yes @obsidian-vfs/cli@0.1.0 inspect --body *)
```

When `OBSIDIAN_VFS_PROJECT_DIR` is set, the rule uses the local path instead: `Bash(./bin/obs-read *)`.

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
npx @obsidian-vfs/cli provision-agents
npx @obsidian-vfs/cli provision-agents --dry-run
npx @obsidian-vfs/cli provision-agents --include architect --include reviewer
npx @obsidian-vfs/cli provision-agents --exclude "draft-*"
npx @obsidian-vfs/cli provision-agents --pin
npx @obsidian-vfs/cli provision-agents --user
npx @obsidian-vfs/cli provision-agents --json
npx @obsidian-vfs/cli provision-agents --set model=opus
npx @obsidian-vfs/cli provision-agents --set model=haiku --set allowed-tools="Bash, Read"
npx @obsidian-vfs/cli provision-agents --unset allowed-tools
npx @obsidian-vfs/cli provision-agents --set model=opus --unset argument-hint
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview without writing |
| `--include <glob>` | Only provision matching agents (repeatable) |
| `--exclude <glob>` | Skip matching agents (repeatable) |
| `--pin` | Pin generated commands to the current CLI version |
| `--user` | Provision to `~/.claude/agents/` and `~/.claude/settings.json` instead of project-level |
| `--set <key=value>` | Override a frontmatter attribute (repeatable) |
| `--unset <key>` | Remove a frontmatter attribute (repeatable) |

#### Agent vs. skill proxies

| Aspect | `provision-skills` | `provision-agents` |
|--------|--------------------|--------------------|
| Output format | `.claude/skills/<name>/SKILL.md` (directory) | `.claude/agents/<name>.md` (flat file) |
| Body mechanism | `!`command`` loads fresh content per session | Full content written at provisioning time |
| Frontmatter | Minimal (name + description), overridable via `--set`/`--unset` | All fields forwarded from vault, overridable via `--set`/`--unset` |
| Wikilink scrubbing | At runtime by `obs-read` | At provisioning time by CLI |
| Permissions | Single generic `Bash(npx ... inspect --body *)` | Same generic rule |
| Content freshness | Always current | Stale until re-provisioned |

Same add-only behavior as skills. Delete `.claude/agents/<name>.md` manually to remove a deprovisioned agent.

#### Model mapping

Provisioning automatically remaps non-Claude `model:` values in vault frontmatter to the closest Claude equivalent. Claude model names (`haiku`, `sonnet`, `opus`) pass through unchanged.

| Vault model | Maps to | Tier |
|-------------|---------|------|
| `gemini-*flash-lite*` | `haiku` | Lightweight |
| `gpt-4o-mini*` | `haiku` | Lightweight |
| `gpt-3.5*` | `haiku` | Lightweight |
| `gemini-*flash*` | `sonnet` | Balanced |
| `gemini-*pro*` | `sonnet` | Balanced |
| `gpt-4o` | `sonnet` | Balanced |
| `gpt-4-turbo*` | `sonnet` | Balanced |
| `gemini-*ultra*` | `opus` | Most capable |
| `gpt-4.5*` | `opus` | Most capable |
| `o1*` | `opus` | Most capable |
| `o3*` | `opus` | Most capable |
| _(unrecognized)_ | `sonnet` | Default fallback |

Mapping runs during provisioning only — vault source notes are never modified. For skills, mapping happens during frontmatter extraction (`formatCuratedLines`). For agents, mapping happens inside `buildFrontmatter` before `--set`/`--unset` overrides are applied, so `--set model=opus` always writes the value verbatim regardless of the vault source model.

### Project-level vs. user-global provisioning

By default, provisioning writes to the project directory:

| Target | Path |
|--------|------|
| Skills | `.claude/skills/` |
| Agents | `.claude/agents/` |
| Permissions | `.claude/settings.local.json` |

With `--user`, provisioning writes to the user-global directory:

| Target | Path |
|--------|------|
| Skills | `~/.claude/skills/` |
| Agents | `~/.claude/agents/` |
| Permissions | `~/.claude/settings.json` |

User-global agents and skills are available across all Claude Code sessions without per-project provisioning. Project-level resources take priority when both exist.

**Known limitation:** `--user` combined with `OBSIDIAN_VFS_PROJECT_DIR` produces project-relative `./bin/obs-read` paths in global proxies, which may not resolve correctly from other directories. Avoid combining the two.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OBSIDIAN_VFS_CLI_PATH` | Path to the Obsidian CLI binary | `"obsidian"` |
| `OBSIDIAN_VFS_TIMEOUT_MS` | CLI operation timeout in milliseconds | `10000` |
| `OBSIDIAN_VFS_PROJECT_DIR` | Local project dir for provisioning (emits `./bin/obs-read` instead of `npx`) | unset |

### `OBSIDIAN_VFS_PROJECT_DIR`

Controls how provisioning emits `!`command`` directives and permission rules:

| Value | `!command` output (unpinned) | `!command` output (--pin) | Use case |
|---|---|---|---|
| Unset | `npx --yes @obsidian-vfs/cli inspect --body "/obs:skill"` | `npx --yes @obsidian-vfs/cli@0.1.0 inspect --body "/obs:skill"` | Production — end users |
| `.` | `./bin/obs-read "/obs:skill"` | `./bin/obs-read "/obs:skill"` | Developing inside the repo |
| `/path/to/obsidian-vfs` | `/path/to/obsidian-vfs/bin/obs-read "/obs:skill"` | `/path/to/obsidian-vfs/bin/obs-read "/obs:skill"` | Local checkout from another project |

Only affects provisioning output. Does not change runtime behavior of `obs-read`, `inspect`, or hook resolution.

## Development

### Developing with local provisioning

```sh
export OBSIDIAN_VFS_PROJECT_DIR=.
npx @obsidian-vfs/cli provision-skills   # emits ./bin/obs-read in proxies
```

For upstream Claude Code documentation on skills, agents, hooks, and plugins, see the [Claude plugin README](../claude-plugin/README.md#claude-code-documentation).
