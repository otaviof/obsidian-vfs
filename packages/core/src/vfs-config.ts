import path from "node:path";

import { ERR } from "./types.js";
import type { VFSConfig, VFSResult } from "./types.js";

/**
 * Default configuration when `.obsidian/obsidian-vfs.json` is absent or fields
 * are omitted. All directories empty, all vault folders accessible.
 */
export const DEFAULT_VFS_CONFIG: VFSConfig = {
  agents: [],
  skills: [],
  allowed: [],
  blocked: [],
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
      error: { code: ERR.PARSE_ERROR, message: "VFSConfig must be a non-null object" },
    };
  }

  const obj = raw as Record<string, unknown>;
  const fields = ["agents", "skills", "allowed", "blocked"] as const;

  for (const field of fields) {
    if (field in obj && !isStringArray(obj[field])) {
      return {
        ok: false,
        error: { code: ERR.PARSE_ERROR, message: `${field} must be string[]` },
      };
    }
  }

  const normalize = (s: string) => path.normalize(s).replace(/\/+$/, "");
  const agents = ((obj.agents as string[] | undefined) ?? []).map(normalize);
  const skills = ((obj.skills as string[] | undefined) ?? []).map(normalize);
  const allowed = ((obj.allowed as string[] | undefined) ?? []).map(normalize);
  const blocked = ((obj.blocked as string[] | undefined) ?? []).map(normalize);

  for (const b of blocked) {
    for (const a of allowed) {
      if (b === a) {
        return {
          ok: false,
          error: {
            code: ERR.PARSE_ERROR,
            message: `"${b}" appears in both "allowed" and "blocked"`,
          },
        };
      }
      if (a.startsWith(b + "/")) {
        return {
          ok: false,
          error: {
            code: ERR.PARSE_ERROR,
            message: `blocked entry "${b}" is a parent of allowed entry "${a}"`,
          },
        };
      }
    }
  }

  return {
    ok: true,
    value: { agents, skills, allowed, blocked },
  };
}
