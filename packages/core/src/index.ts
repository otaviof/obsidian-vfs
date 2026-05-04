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
export { DEFAULT_CLI_PATH, DEFAULT_TIMEOUT_MS, resolveExecConfig } from "./exec.js";
export type { CLIExecOptions } from "./exec.js";

/**
 * Concrete implementations — CLI wrapper and async queue.
 */
export { ObsidianCLIImpl } from "./obsidian-cli.js";
export { AsyncQueue } from "./queue.js";

/**
 * LRU cache, URI parsing, config validation, secure file reads, and tracker.
 */
export { LRUCache } from "./lru-cache.js";
export { parseObsUri, buildObsUri } from "./uri.js";
export { validateVFSConfig } from "./vfs-config.js";
export { readVirtualFile } from "./read-file.js";
export { LocalIndexTracker } from "./local-index-tracker.js";

/**
 * Modules: resolution, content processing, watching, enumeration.
 */
export { resolveWikilink } from "./resolve-wikilink.js";
export { resolveResource, resolveSkillResource } from "./resolve-resource.js";
export { sliceContent, scrubWikilinks, processContent } from "./content-slice.js";
export { VaultFileWatcher } from "./file-watcher.js";
export { readDirectory, statVirtualFile } from "./fs-enumeration.js";
export {
  MENTION_PREFIX,
  SKILL_PREFIX,
  parseSection,
  resolveMention,
  resolveSkillMention,
} from "./resolve-mention.js";
