# @obsidian-vfs/core

Shared engine for Obsidian VFS. Provides `obs://` URI resolution, file I/O, Obsidian CLI integration, LRU caching, and content processing used by all consumer packages.

## Responsibilities

- **URI resolution** — `obs://` scheme handling, `@obs:` context mentions, `/obs:` skill mentions, `[[wikilink]]` resolution.
- **File I/O** — Direct reads via `node:fs` (bypassing the CLI for performance), directory enumeration, file watching.
- **Obsidian CLI wrapper** — Async queue-serialized calls to the `obsidian` binary for search, backlinks, vault discovery. JSON and plain-text response parsing.
- **Content processing** — Section slicing by `#heading`, `[[wikilink]]` scrubbing to `obs://` URIs, `![[embed]]` transclusion, Markdown link parsing.
- **Frontmatter** — Extraction, curation, and formatting of YAML frontmatter. Model field mapping to Claude model identifiers via `mapModelToClaude()`.
- **Caching** — Generic `LRUCache<K, V>` with TTL expiration.
- **Security** — `path.resolve` + vault-root prefix check on all I/O. Symlink rejection outside vault. `allowedFolders` enforcement.
- **Configuration** — Vault config from `.obsidian/obsidian-vfs.json` (`agentsDirs`, `skillsDirs`, `allowedFolders`).

## Exports

The package exposes two entry points:

| Entry | Path | Purpose |
|-------|------|---------|
| `.` | `dist/index.js` | All production exports |
| `./testing` | `dist/test-helpers.js` | Test utilities and mocks |

### Key Exports

| Category | Symbols |
|----------|---------|
| Resolution | `resolveMention`, `resolveSkillMention`, `resolveWikilink`, `normalizeMention`, `parseSection` |
| File I/O | `readVirtualFile`, `listMarkdownFiles`, `readDirectory` |
| CLI | `ObsidianCLI`, `resolveExecConfig`, `resolveCliPath` |
| Content | `sliceContent`, `scrubWikilinks`, `processContent`, `resolveEmbeds` |
| Frontmatter | `extractFrontmatter`, `extractCuratedFrontmatter`, `remapModelLine`, `mapModelToClaude` |
| Types | `VFSResult`, `VFSError`, `VFSConfig`, `ErrorCode`, `MentionKind` |
| Utilities | `LRUCache`, `LocalIndexTracker`, `AsyncQueue` |
| Constants | `URI_SCHEME`, `URI_PREFIX`, `MENTION_PREFIX`, `SKILL_PREFIX` |

## Result Types

All fallible operations return `VFSResult<T>`, a discriminated union:

```ts
type VFSResult<T> = { ok: true; value: T } | { ok: false; error: VFSError };
```

No nulls, no thrown exceptions for expected failures.

## CLI Parsing Convention

The Obsidian CLI returns different formats per command:

- `search`, `backlinks` → JSON
- `vault`, `files`, `folders`, `read` → plain text
- Exit code is always `0`; detect errors via `Error:` prefix in stdout.

## Degraded Mode

When Obsidian is not running, the core falls back to `node:fs` for reads and enumeration. Search and wikilink resolution are unavailable in this mode.
