import { realpath } from "node:fs/promises";
import path from "node:path";

import { ERR, ERRNO, VAULT_MODE } from "./types.js";
import type { VFSResult, VaultMode } from "./types.js";
import { buildMountTree } from "./mount-tree.js";

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
      error: { code: ERR.PERMISSION_DENIED, message: "Path resolves outside vault root" },
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
        error: { code: ERR.PERMISSION_DENIED, message: "Path within blocked folders" },
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
    error: { code: ERR.PERMISSION_DENIED, message: "Path not within allowed folders" },
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
        error: { code: ERR.PERMISSION_DENIED, message: "Symlink resolves outside vault root" },
      };
    }
    return { ok: true, value: real };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === ERRNO.ENOENT) {
      return {
        ok: false,
        error: { code: ERR.FILE_NOT_FOUND, message: `File does not exist: ${absolutePath}` },
      };
    }
    return {
      ok: false,
      error: { code: ERR.PERMISSION_DENIED, message: `Cannot resolve path: ${absolutePath}` },
    };
  }
}

/**
 * Check whether a write to `virtualPath` is permitted under the given
 * vault mode. Returns `PERMISSION_DENIED` when the write is blocked.
 *
 * - `"rw"`: always permits.
 * - `"ro"`: always rejects.
 * - `"partial"`: permits if `virtualPath` falls within an `autoMount` entry.
 */
export function checkVaultMode(
  virtualPath: string,
  mode: VaultMode,
  autoMount: readonly string[],
): VFSResult<string> {
  if (mode === VAULT_MODE.RW) return { ok: true, value: virtualPath };
  if (mode === VAULT_MODE.RO) {
    return {
      ok: false,
      error: { code: ERR.PERMISSION_DENIED, message: "Vault is read-only" },
    };
  }
  const tree = buildMountTree(autoMount);
  const segments = virtualPath.split("/").filter(Boolean);
  let node: ReturnType<typeof buildMountTree> | null = tree;
  for (const seg of segments) {
    if (node === null) return { ok: true, value: virtualPath };
    const child = node.get(seg);
    if (child === undefined) {
      return {
        ok: false,
        error: { code: ERR.PERMISSION_DENIED, message: "Path not within mounted folders" },
      };
    }
    node = child;
  }
  return { ok: true, value: virtualPath };
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

/**
 * Like `validatePath` but for write operations where the target may not exist.
 * Walks up to the nearest existing ancestor for the symlink check instead of
 * requiring the full path to exist. Returns the canonicalized absolute path.
 */
export async function validatePathForWrite(
  virtualPath: string,
  options: PathSecurityOptions,
): Promise<VFSResult<string>> {
  const canonical = canonicalizePath(virtualPath, options.vaultRoot);
  if (!canonical.ok) return canonical;

  const allowed = checkAllowedFolder(canonical.value, options);
  if (!allowed.ok) return allowed;

  let ancestor = canonical.value;
  for (;;) {
    const result = await checkSymlink(ancestor, options.vaultRoot);
    if (result.ok) return { ok: true, value: canonical.value };
    if (result.error.code !== ERR.FILE_NOT_FOUND) return result;
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return result;
    ancestor = parent;
  }
}
