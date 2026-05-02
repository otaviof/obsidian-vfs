import type { VFSConfig, VFSResult } from "./types.js";

/**
 * Default configuration when `.obsidian/obsidian-vfs.json` is absent or fields
 * are omitted. All directories empty, all vault folders accessible.
 */
export const DEFAULT_VFS_CONFIG: VFSConfig = {
  agentsDirs: [],
  skillsDirs: [],
  allowedFolders: [],
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Validate raw JSON (from `.obsidian/obsidian-vfs.json`) into a typed `VFSConfig`.
 * Missing fields default to empty arrays. Extra fields are silently ignored.
 * Returns `PARSE_ERROR` when a field is present but has the wrong type.
 */
export function validateVFSConfig(raw: unknown): VFSResult<VFSConfig> {
  if (raw == null) {
    return { ok: true, value: { ...DEFAULT_VFS_CONFIG } };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "VFSConfig must be a non-null object" },
    };
  }

  const obj = raw as Record<string, unknown>;
  const fields = ["agentsDirs", "skillsDirs", "allowedFolders"] as const;

  for (const field of fields) {
    if (field in obj && !isStringArray(obj[field])) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: `${field} must be string[]` },
      };
    }
  }

  return {
    ok: true,
    value: {
      agentsDirs: (obj.agentsDirs as string[] | undefined) ?? [],
      skillsDirs: (obj.skillsDirs as string[] | undefined) ?? [],
      allowedFolders: (obj.allowedFolders as string[] | undefined) ?? [],
    },
  };
}
