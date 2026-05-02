/**
 * CLI abstraction layer contract and supporting query result types.
 */
export type { BacklinkEntry, ObsidianCLI, SearchMatch } from "./cli.js";

/**
 * Foundational data structures: error codes, result union, config, and resolution.
 */
export type {
  ErrorCode,
  ResolutionResult,
  VaultContext,
  VFSConfig,
  VFSError,
  VFSResult,
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
