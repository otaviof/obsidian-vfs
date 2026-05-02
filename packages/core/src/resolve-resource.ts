import { access } from "node:fs/promises";
import path from "node:path";

import type { PathSecurityOptions } from "./path-security.js";
import { canonicalizePath, checkAllowedFolder } from "./path-security.js";
import type { VFSResult } from "./types.js";

/** Canonical filename inside a skill directory. */
const SKILL_FILENAME = "SKILL.md";

/**
 * Resolve a skill by name as a directory containing SKILL.md. First match wins.
 */
export async function resolveSkillResource(
  name: string,
  dirs: readonly string[],
  securityOptions: PathSecurityOptions,
): Promise<VFSResult<string>> {
  const trimmed = name.trim();

  for (const dir of dirs) {
    const vaultRelative = path.join(dir, trimmed, SKILL_FILENAME);
    const canonical = canonicalizePath(vaultRelative, securityOptions.vaultRoot);
    if (!canonical.ok) continue;

    const allowed = checkAllowedFolder(canonical.value, securityOptions);
    if (!allowed.ok) continue;

    try {
      await access(canonical.value);
      return { ok: true, value: vaultRelative };
    } catch {
      continue;
    }
  }

  return {
    ok: false,
    error: { code: "FILE_NOT_FOUND", message: `Skill not found: ${trimmed}` },
  };
}

/**
 * Resolve a named resource by scanning directories in order. First match wins.
 */
export async function resolveResource(
  name: string,
  dirs: readonly string[],
  securityOptions: PathSecurityOptions,
): Promise<VFSResult<string>> {
  const trimmed = name.trim();
  const fileName = trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;

  for (const dir of dirs) {
    const vaultRelative = path.join(dir, fileName);
    const canonical = canonicalizePath(vaultRelative, securityOptions.vaultRoot);
    if (!canonical.ok) continue;

    const allowed = checkAllowedFolder(canonical.value, securityOptions);
    if (!allowed.ok) continue;

    try {
      await access(canonical.value);
      return { ok: true, value: vaultRelative };
    } catch {
      continue;
    }
  }

  return {
    ok: false,
    error: { code: "FILE_NOT_FOUND", message: `Resource not found: ${trimmed}` },
  };
}
