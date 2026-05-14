import { realpath } from "node:fs/promises";
import path from "node:path";

import type { VFSResult } from "./types.js";

/**
 * Immutable parameters for path security checks — vault root, folder allowlist,
 * and folder blocklist.
 */
export interface PathSecurityOptions {
  readonly vaultRoot: string;
  readonly allowed: readonly string[];
  readonly blocked: readonly string[];
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
 * Verify that `absolutePath` does not fall within any blocked folder. Synchronous.
 */
export function checkBlockedFolder(
  absolutePath: string,
  options: PathSecurityOptions,
): VFSResult<string> {
  for (const folder of options.blocked) {
    const blockedAbs = path.resolve(options.vaultRoot, folder);
    if (absolutePath === blockedAbs || absolutePath.startsWith(blockedAbs + path.sep)) {
      return {
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "Path within blocked folders" },
      };
    }
  }
  return { ok: true, value: absolutePath };
}

/**
 * When `allowed` is non-empty, verify that `absolutePath` falls within at
 * least one allowed folder (resolved relative to `vaultRoot`). Empty allowlist
 * permits all vault paths. Checks `blocked` first — deny wins. Synchronous.
 */
export function checkAllowedFolder(
  absolutePath: string,
  options: PathSecurityOptions,
): VFSResult<string> {
  const blockedResult = checkBlockedFolder(absolutePath, options);
  if (!blockedResult.ok) return blockedResult;

  if (options.allowed.length === 0) {
    return { ok: true, value: absolutePath };
  }

  for (const folder of options.allowed) {
    const allowed = path.resolve(options.vaultRoot, folder);
    if (absolutePath === allowed || absolutePath.startsWith(allowed + path.sep)) {
      return { ok: true, value: absolutePath };
    }
    if (allowed.startsWith(absolutePath + path.sep)) {
      return { ok: true, value: absolutePath };
    }
  }

  return {
    ok: false,
    error: { code: "PERMISSION_DENIED", message: "Path not within allowed folders" },
  };
}

/**
 * Convenience predicate: is `virtualPath` reachable given `allowed`/`blocked`?
 */
export function isAllowedPath(virtualPath: string, options: PathSecurityOptions): boolean {
  const canonical = canonicalizePath(virtualPath, options.vaultRoot);
  if (!canonical.ok) return false;
  return checkAllowedFolder(canonical.value, options).ok;
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
 * Compose all path security checks in order: canonicalize → allowed/blocked →
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
