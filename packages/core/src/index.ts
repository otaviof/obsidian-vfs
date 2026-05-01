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
