# @obsidian-vfs/claude-plugin

Claude Code plugin that intercepts every `UserPromptSubmit` hook, scans for `@obs:` and `/obs:` mentions in your prompts, resolves each through the Obsidian vault, and injects the content as `additionalContext`.

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

The plugin manifest lives at the repo root (`.claude-plugin/plugin.json`), so point `--plugin-dir` at the repo itself:

```sh
# Build the plugin (required before first use)
pnpm build

# Launch Claude Code with the plugin loaded
claude --plugin-dir /path/to/obsidian-vfs

# Or from within the repo
claude --plugin-dir .
```

## How It Works

The plugin uses a `UserPromptSubmit` hook configured in `hooks/hooks.json`:

1. Claude Code fires the hook when a prompt is submitted.
2. The handler (`bin/obs-hook-handler`) reads the prompt from stdin as JSON.
3. `extractMentions()` parses `@obs:` and `/obs:` references (masking code blocks to avoid false matches).
4. Each mention is resolved in parallel through the core engine — context mentions via `resolveMention()`, skill mentions via `resolveSkillMention()`.
5. Resolved content is formatted into blocks and returned as `additionalContext` in the JSON output.

### Hook Configuration

The hook is defined in `hooks/hooks.json`:

```json
{
  "hooks": [
    {
      "event": "UserPromptSubmit",
      "type": "command",
      "command": "${CLAUDE_PLUGIN_ROOT}/bin/obs-hook-handler",
      "timeout": 30
    }
  ]
}
```

`${CLAUDE_PLUGIN_ROOT}` is interpolated by Claude Code to the plugin's root directory at runtime.

## `bin/` Executables

Two standalone Node.js scripts in `bin/` at the repo root, auto-discovered by Claude Code and added to the Bash PATH at runtime:

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

Thin wrapper that locates `packages/claude-plugin/dist/hook-handler.js` via `import.meta.url` and dynamically imports it. Replaces the inline `node ${CLAUDE_PLUGIN_ROOT}/...` command in the hook configuration with a self-resolving executable.

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
