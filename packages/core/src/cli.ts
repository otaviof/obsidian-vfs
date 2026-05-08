import type { VFSResult } from "./types.js";

/**
 * Structured search result with line-level context for each matching file.
 */
export interface SearchMatch {
  file: string;
  matches: { line: number; text: string }[];
}

/**
 * Single backlink reference pointing back to the queried file.
 */
export interface BacklinkEntry {
  file: string;
}

/**
 * CLI abstraction layer contract. Wraps the Obsidian CLI binary with typed
 * methods for vault discovery, querying, and enumeration. All methods
 * return `Promise<VFSResult<T>>` except `isAvailable` which is a plain boolean
 * health-check probe.
 */
export interface ObsidianCLI {
  /** Absolute path to the vault root directory. */
  vaultPath(): Promise<VFSResult<string>>;

  /** Human-readable vault name. */
  vaultName(): Promise<VFSResult<string>>;

  /** Full-text search returning matching file paths. */
  search(
    query: string,
    opts?: { path?: string; limit?: number; contextLength?: number },
  ): Promise<VFSResult<string[]>>;

  /** Full-text search returning matches with per-line context. */
  searchContext(
    query: string,
    opts?: { path?: string; limit?: number; contextLength?: number },
  ): Promise<VFSResult<SearchMatch[]>>;

  /** List files, optionally scoped to a folder. */
  files(folder?: string): Promise<VFSResult<string[]>>;

  /** List folders, optionally scoped to a parent folder. */
  folders(folder?: string): Promise<VFSResult<string[]>>;

  /** Incoming wikilink references to the given file. */
  backlinks(file: string): Promise<VFSResult<BacklinkEntry[]>>;

  /** Outgoing wikilink references from the given file. */
  links(file: string): Promise<VFSResult<string[]>>;

  /** Open a note in Obsidian's UI. */
  open(file: string, newtab?: boolean): Promise<VFSResult<void>>;

  /** Path to today's daily note. */
  dailyPath(): Promise<VFSResult<string>>;

  /** List all tags in the vault. */
  tags(opts?: { sort?: "name" | "count" }): Promise<VFSResult<string[]>>;

  /** Read a frontmatter property value from a note. */
  propertyRead(file: string, name: string): Promise<VFSResult<string>>;

  /** Health-check, returns true when the Obsidian app is reachable. */
  isAvailable(): Promise<boolean>;
}
