import { realpath } from "node:fs/promises";
import path from "node:path";

import type { VFSResult } from "./types.js";

/**
 * Immutable parameters for path security checks — vault root and optional
 * folder allowlist.
 */
export interface PathSecurityOptions {
  readonly vaultRoot: string;
  readonly allowedFolders: readonly string[];
}

/**
 * Resolve `virtualPath` against `vaultRoot` and verify the result stays within
 * the vault. Returns `PERMISSION_DENIED` on traversal. Synchronous — no I/O.
 */
export function canonicalizePath(virtualPath: string, vaultRoot: string): VFSResult<string> {
  const resolved = path.resolve(vaultRoot, virtualPath);
  if (resolved !== vaultRoot && !resolved.startsWith(vaultRoot + path.sep)) {
    return {
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path resolves outside vault root" },
    };
  }
  return { ok: true, value: resolved };
}

/**
 * When `allowedFolders` is non-empty, verify that `absolutePath` falls within at
 * least one allowed folder (resolved relative to `vaultRoot`). Empty allowlist
 * permits all vault paths. Synchronous — no I/O.
 */
export function checkAllowedFolder(
  absolutePath: string,
  options: PathSecurityOptions,
): VFSResult<string> {
  if (options.allowedFolders.length === 0) {
    return { ok: true, value: absolutePath };
  }

  for (const folder of options.allowedFolders) {
    const allowed = path.resolve(options.vaultRoot, folder);
    if (absolutePath === allowed || absolutePath.startsWith(allowed + path.sep)) {
      return { ok: true, value: absolutePath };
    }
  }

  return {
    ok: false,
    error: { code: "PERMISSION_DENIED", message: "Path not within allowed folders" },
  };
}

/**
 * Follow all symlinks via `fs.realpath` and verify the physical path stays within
 * the vault. Returns `FILE_NOT_FOUND` on ENOENT, `PERMISSION_DENIED` on escape.
 */
export async function checkSymlink(
  absolutePath: string,
  vaultRoot: string,
): Promise<VFSResult<string>> {
  try {
    const real = await realpath(absolutePath);
    if (real !== vaultRoot && !real.startsWith(vaultRoot + path.sep)) {
      return {
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "Symlink resolves outside vault root" },
      };
    }
    return { ok: true, value: real };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `File does not exist: ${absolutePath}` },
      };
    }
    return {
      ok: false,
      error: { code: "PERMISSION_DENIED", message: `Cannot resolve path: ${absolutePath}` },
    };
  }
}

/**
 * Compose all path security checks in order: canonicalize → allowedFolders →
 * symlink. Short-circuits on first failure. Returns the validated absolute path.
 */
export async function validatePath(
  virtualPath: string,
  options: PathSecurityOptions,
): Promise<VFSResult<string>> {
  const canonical = canonicalizePath(virtualPath, options.vaultRoot);
  if (!canonical.ok) return canonical;

  const allowed = checkAllowedFolder(canonical.value, options);
  if (!allowed.ok) return allowed;

  return checkSymlink(canonical.value, options.vaultRoot);
}
