/**
 * Literal union of all error codes returned by the VFS layer.
 */
export type ErrorCode =
  | "VAULT_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "PARSE_ERROR"
  | "CLI_ERROR"
  | "CLI_UNAVAILABLE"
  | "TIMEOUT"
  | "PERMISSION_DENIED"
  | "INVALID_URI";

/**
 * Structured error with a typed code and optional originating CLI command.
 */
export interface VFSError {
  code: ErrorCode;
  message: string;
  command?: string;
}

/**
 * Discriminated union — success carries `value`, failure carries `error`. Never
 * nulls.
 */
export type VFSResult<T> = { ok: true; value: T } | { ok: false; error: VFSError };

/**
 * Shape of `.obsidian/obsidian-vfs.json`, paths (directories) the vault exposes.
 */
export interface VFSConfig {
  agentsDirs: string[];
  skillsDirs: string[];
  allowedFolders: string[];
}

/**
 * Initialized vault state after discovery and config loading.
 */
export interface VaultContext {
  name: string;
  physicalPath: string;
  vfsConfig: VFSConfig;
  mode: "full" | "degraded";
}

/**
 * Result of wikilink resolution bundling the chosen path with all search candidates.
 */
export interface WikilinkResolution {
  readonly resolvedPath: string;
  readonly candidates: readonly string[];
}

/**
 * Output of `obs://` URI resolution, what the URI points to and where.
 */
export interface ResolutionResult {
  targetType: "file" | "agent" | "skill" | "search";
  resolvedPath: string;
  vaultName: string;
}

/**
 * Cleanup handle for subscriptions and watchers.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Filesystem entry type for directory enumeration.
 */
export type VFSFileType = "file" | "directory";

/**
 * File metadata matching the shape VSCode FileStat needs.
 */
export interface VFSFileStat {
  readonly type: VFSFileType;
  readonly mtime: number;
  readonly ctime: number;
  readonly size: number;
}

/**
 * Output of `@obs:` mention resolution with full content payload.
 */
export interface MentionResult {
  readonly targetType: "file" | "agent" | "skill";
  readonly resolvedPath: string;
  readonly vaultName: string;
  readonly content: string;
  readonly section?: string;
}

/**
 * Metadata for a vault resource (skill or agent) discovered during enumeration.
 */
export interface DiscoveredResource {
  readonly name: string;
  readonly description: string;
  readonly vaultRelativePath: string;
}
