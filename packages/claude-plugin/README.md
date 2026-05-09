# @obsidian-vfs/claude-plugin

Claude Code plugin that intercepts `UserPromptSubmit`, `UserPromptExpansion`, and `SubagentStart` hooks to resolve vault references and inject content as `additionalContext`.

- **`UserPromptSubmit`** — scans prompts for `@obs:` and `/obs:` mentions, resolves each through the vault.
- **`UserPromptExpansion`** — detects vault-sourced proxy skills (provisioned via CLI), resolves `obs://` URIs in the skill's content to pre-load linked notes.
- **`SubagentStart`** — scans provisioned agent definitions for `obs://` URIs and resolves linked notes into the agent's context.

## Mention Syntax

Two mention formats are supported:

### `@obs:` — Context Mentions

Resolve through the full chain: agents, skills, files, then wikilinks.

```
@obs:architect                     # Agent by name (from agentsDirs)
@obs:10-projects/plan.md           # File by vault-relative path
@obs:plan.md#Architecture          # Section within a file
```

### `/obs:` — Skill Mentions

Always resolve as a skill. No fallback to agents, files, or wikilinks.

```
/obs:obsidian                      # Skill by name (from skillsDirs)
/obs:obsidian#Usage                # Section within a skill
```

### Parsing Rules

- Mentions inside fenced code blocks and inline code are ignored.
- Duplicate mentions are resolved once.
- `@obs:X` and `/obs:X` with the same name resolve independently (context vs. skill path).
- Failed resolutions appear as error messages in context rather than crashing.

## Installation

### From GitHub

Add the repository as a marketplace, then install the plugin:

```sh
# Add the marketplace (one-time setup)
/plugin marketplace add otaviof/obsidian-vfs

# Install the plugin
/plugin install obsidian-vfs

# Reload to activate
/reload-plugins
```

Or from the CLI outside a session:

```sh
claude plugin marketplace add otaviof/obsidian-vfs
claude plugin install obsidian-vfs
```

### Local development

The plugin manifest lives at the repo root (`.claude-plugin/plugin.json`), so point `--plugin-dir` at the repo itself:

```sh
# Build the plugin (required before first use)
pnpm install && pnpm build

# Launch Claude Code with the plugin loaded
claude --plugin-dir /path/to/obsidian-vfs

# Or from within the repo
claude --plugin-dir .
```

## How It Works

The plugin uses three hooks configured in `hooks/hooks.json`:

### `UserPromptSubmit` — mention resolution

1. Claude Code fires the hook when a prompt is submitted.
2. The handler (`bin/obs-hook-handler`) reads the prompt from stdin as JSON.
3. `extractMentions()` parses `@obs:` and `/obs:` references (masking code blocks to avoid false matches).
4. Each mention is resolved in parallel through the core engine — context mentions via `resolveMention()`, skill mentions via `resolveSkillMention()`.
5. Resolved content is formatted into blocks and returned as `additionalContext` in the JSON output.

### `UserPromptExpansion` — skill reference resolution

1. Fires when a user invokes any slash command (e.g., `/spike-skill`).
2. The handler (`bin/obs-expansion-handler`) checks if the command maps to a vault-sourced proxy skill (reads `.claude/skills/<name>/SKILL.md` for the `inspect --body "/obs:..."` pattern).
3. If it's a vault proxy, resolves the skill content, extracts `obs://` URIs (wikilinks scrubbed to links), and resolves each linked note.
4. Returns resolved reference content as `additionalContext` so Claude sees both the skill and its linked notes.
5. Non-vault commands exit in <1ms (one file read).

### `SubagentStart` — agent reference resolution

1. Fires when a subagent spawns.
2. The handler (`bin/obs-subagent-handler`) reads `.claude/agents/<agent_type>.md` and scans for `obs://` URIs.
3. If URIs are found, bootstraps the tracker and resolves each linked note.
4. Returns resolved content as `additionalContext` for the agent's context.

### Hook Configuration

All hooks are defined in `hooks/hooks.json`. `${CLAUDE_PLUGIN_ROOT}` is interpolated by Claude Code to the plugin's root directory at runtime.

## `bin/` Executables

Four standalone Node.js scripts in `bin/` at the repo root, auto-discovered by Claude Code and added to the Bash PATH at runtime:

### `obs-read`

Thin wrapper around the CLI's `inspect --body` command. Resolves a mention through the core pipeline (resolve, read, section slice, wikilink scrub) and writes the content to stdout. Accepts any mention format:

```sh
obs-read "architect"             # Bare name → @obs:architect
obs-read "@obs:note#Section"     # Existing prefix preserved
obs-read "/obs:deploy"           # Skill resolution
obs-read "10-projects/plan.md"   # Vault-relative path
```

Exit codes: `0` success, `1` resolution error, `2` usage error. Errors go to stderr; content to stdout.

Used by Claude's Bash tool at runtime via bare `obs-read` (on PATH). Provisioned skill proxies use `npx @obsidian-vfs/cli inspect --body` instead (or `./bin/obs-read` when `OBSIDIAN_VFS_PROJECT_DIR` is set for local development).

### `obs-hook-handler`

Thin wrapper that imports `packages/claude-plugin/bundle/hook-handler.mjs` for `UserPromptSubmit` handling.

### `obs-expansion-handler`

Thin wrapper that imports `packages/claude-plugin/bundle/entry-expansion.mjs` for `UserPromptExpansion` handling.

### `obs-subagent-handler`

Thin wrapper that imports `packages/claude-plugin/bundle/entry-subagent.mjs` for `SubagentStart` handling.

## Why Provisioning Exists

The `@obs:` hook delivers vault content via `additionalContext`, which works well for ad-hoc context injection. However, `additionalContext` is treated as passive context — it lacks the features that make Claude Code skills and agents powerful:

- **No `/` autocomplete** — users can't discover vault skills through the slash menu.
- **No `$ARGUMENTS`** — skills can't accept parameters.
- **No `context: fork`** — skills can't run in isolated subagents.
- **No compaction survival** — injected content is dropped when the context window compacts (native skills are re-attached up to 5K tokens each).
- **No `allowed-tools`** — skills can't pre-authorize tool permissions.
- **No dynamic registration** — there is no API to register new skills at runtime; they must exist on disk at discovery time.

The [CLI provisioning commands](../cli/README.md) solve this by generating proxy files at `.claude/skills/` and `.claude/agents/` that Claude Code discovers natively.

### Skills vs. Agents: Different Proxy Strategies

**Skill proxies** use "!`command`" directives that call `npx @obsidian-vfs/cli inspect --body` (or `./bin/obs-read` for local development) to fetch live vault content at invocation time. This keeps skill content always current — each session gets the latest vault version.

**Agent proxies** write the full vault content at provisioning time. This is a Claude Code platform constraint: the "!`command`" preprocessing is a `SKILL.md`-only feature — it does not work in agent files. An agent file containing "!`command`" produces the literal text, not the command output. `[[wikilinks]]` in agent content are converted to `obs://` URIs at provisioning time so Claude can follow them via `obs-read` at runtime.

### Runtime PATH

After skill invocation, Claude follows wikilinks in skill content by calling bare `obs-read` via the Bash tool — this works because the plugin's `bin/` directory is on PATH in that context.

The "!`command`" preprocessor runs in a separate shell context without the plugin PATH, which is why skill proxies use `npx @obsidian-vfs/cli inspect --body` (fetched from npm) or `./bin/obs-read` (local development via `OBSIDIAN_VFS_PROJECT_DIR`).

See the [CLI documentation](../cli/README.md) for provisioning commands and options.

## Known Issues

- **`IS_DEMO=1` disables hooks.** If this environment variable is set in `~/.claude/settings.json` (or exported), all hooks — including the `@obs:` resolver — are silently blocked. Remove it or set `IS_DEMO=0` to restore hook execution.

## Claude Code Documentation

- [Create plugins](https://code.claude.com/docs/en/plugins) — plugin structure, manifest, loading
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference) — `plugin.json` fields, `bin/`, environment variables
- [Automate workflows with hooks](https://code.claude.com/docs/en/hooks-guide) — hook events, `additionalContext`, JSON format
- [Hooks reference](https://code.claude.com/docs/en/hooks) — event types, lifecycle, timeout behavior
- [Extend Claude with skills](https://code.claude.com/docs/en/skills) — `SKILL.md` format, "!`command`", frontmatter, discovery
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents) — agent files, frontmatter, invocation modes
