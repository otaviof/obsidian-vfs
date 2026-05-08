/**
 * CLI abstraction layer contract and supporting query result types.
 */
export type { BacklinkEntry, ObsidianCLI, SearchMatch } from "./cli.js";

/**
 * Foundational data structures: error codes, result union, config, and resolution.
 */
export type {
  DiscoveredResource,
  Disposable,
  ErrorCode,
  MentionResult,
  ResolutionResult,
  VaultContext,
  VFSConfig,
  VFSError,
  VFSFileStat,
  VFSFileType,
  VFSResult,
  WikilinkResolution,
} from "./types.js";

/**
 * Parsed `obs://` URI components.
 */
export type { ObsUriComponents } from "./uri.js";

/**
 * Parameters for path security validation.
 */
export type { PathSecurityOptions } from "./path-security.js";

/**
 * Factory configuration for `LocalIndexTracker.create`.
 */
export type { LocalIndexTrackerOptions } from "./local-index-tracker.js";

/**
 * Content transformation options.
 */
export type { ContentSliceOptions } from "./content-slice.js";

/**
 * Wikilink resolution parameters.
 */
export type { ResolveWikilinkOptions } from "./resolve-wikilink.js";

/**
 * File watcher event types.
 */
export type { FileChangeEvent, FileChangeListener, FileChangeType } from "./file-watcher.js";

/**
 * CLI execution defaults and options.
 */
export { DEFAULT_TIMEOUT_MS, resolveExecConfig } from "./exec.js";
export type { CLIExecOptions } from "./exec.js";

/**
 * Platform-aware CLI binary path resolution.
 */
export {
  resolveCliPath,
  OBSIDIAN_VFS_CLI_PATH,
  PLATFORM_OBSIDIAN_VFS_CLI_PATHS,
} from "./resolve-cli-path.js";
export type { ResolveCliPathOptions } from "./resolve-cli-path.js";

/**
 * Shared bootstrap: create a `LocalIndexTracker` from CLI options.
 */
export { bootstrapTracker } from "./bootstrap.js";
export type { BootstrapResult } from "./bootstrap.js";

/**
 * Process exit codes shared across CLI and plugin packages.
 */
export { EXIT_SUCCESS, EXIT_ERROR, EXIT_USAGE } from "./exit-codes.js";

/**
 * Path security: canonicalize, validate, and check symlinks.
 */
export { validatePath, canonicalizePath } from "./path-security.js";

/**
 * Concrete implementations — CLI wrapper and async queue.
 */
export { ObsidianCLIImpl } from "./obsidian-cli.js";
export { AsyncQueue } from "./queue.js";

/**
 * LRU cache, URI parsing, config validation, secure file reads, and tracker.
 */
export { LRUCache } from "./lru-cache.js";
export { URI_SCHEME, URI_PREFIX, parseObsUri, buildObsUri } from "./uri.js";
export { validateVFSConfig } from "./vfs-config.js";
export { readVirtualFile } from "./read-file.js";
export { LocalIndexTracker } from "./local-index-tracker.js";

/**
 * Modules: resolution, content processing, watching, enumeration.
 */
export { resolveWikilink } from "./resolve-wikilink.js";
export { resolveResource, resolveSkillResource } from "./resolve-resource.js";
export { sliceContent, scrubWikilinks, processContent } from "./content-slice.js";
export {
  parseMarkdownLinks,
  normalizeWikilink,
  classifyInput,
  resolveEmbeds,
} from "./markdown-links.js";
export type { ParsedLink, EmbedResolver } from "./markdown-links.js";
export { VaultFileWatcher } from "./file-watcher.js";
export { listMarkdownFiles, readDirectory, statVirtualFile } from "./fs-enumeration.js";
export {
  MENTION_PREFIX,
  SKILL_PREFIX,
  normalizeMention,
  parseSection,
  resolveMention,
  resolveSkillMention,
} from "./resolve-mention.js";

/**
 * Claude model mapping for non-Claude model names.
 */
export type { ClaudeModel } from "./model-mapping.js";
export {
  CLAUDE_HAIKU,
  CLAUDE_SONNET,
  CLAUDE_OPUS,
  DEFAULT_MODEL,
  mapModelToClaude,
} from "./model-mapping.js";

/**
 * Frontmatter extraction and model remapping utilities.
 */
export type { CuratedFrontmatter } from "./frontmatter.js";
export {
  DESCRIPTION_RE,
  MODEL_LINE_RE,
  ALLOWED_TOOLS_RE,
  ARGUMENT_HINT_RE,
  extractFrontmatter,
  extractFrontmatterField,
  extractFrontmatterDescription,
  extractCuratedFrontmatter,
  formatCuratedLines,
  remapModelLine,
} from "./frontmatter.js";
