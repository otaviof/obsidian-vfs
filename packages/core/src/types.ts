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
  | "INVALID_URI"
  | "NOT_IMPLEMENTED";

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
 * Output of `obs://` URI resolution, what the URI points to and where.
 */
export interface ResolutionResult {
  targetType: "file" | "agent" | "skill" | "search";
  resolvedPath: string;
  vaultName: string;
}
