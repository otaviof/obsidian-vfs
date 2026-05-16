import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { PathSecurityOptions } from "./path-security.js";
import { canonicalizePath, checkAllowedFolder, validatePath } from "./path-security.js";
import { ERR, ERRNO } from "./types.js";
import type { VFSFileStat, VFSFileType, VFSResult } from "./types.js";

/**
 * List immediate children of a directory with type information.
 */
export async function readDirectory(
  virtualPath: string,
  options: PathSecurityOptions,
): Promise<VFSResult<readonly [string, VFSFileType][]>> {
  const canonical = canonicalizePath(virtualPath, options.vaultRoot);
  if (!canonical.ok) return canonical;

  const parentAllowed = checkAllowedFolder(canonical.value, options);
  if (!parentAllowed.ok) return parentAllowed;

  let entries;
  try {
    entries = await readdir(canonical.value, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === ERRNO.ENOENT) {
      return {
        ok: false,
        error: { code: ERR.FILE_NOT_FOUND, message: `Directory does not exist: ${virtualPath}` },
      };
    }
    if (code === ERRNO.ENOTDIR) {
      return {
        ok: false,
        error: { code: ERR.FILE_NOT_FOUND, message: `Not a directory: ${virtualPath}` },
      };
    }
    return {
      ok: false,
      error: { code: ERR.CLI_ERROR, message: (err as Error).message },
    };
  }

  const tuples: [string, VFSFileType][] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const childAbsolute = path.join(canonical.value, entry.name);
    const childAllowed = checkAllowedFolder(childAbsolute, options);
    if (!childAllowed.ok) continue;

    tuples.push([entry.name, entry.isDirectory() ? "directory" : "file"]);
  }

  tuples.sort((a, b) => a[0].localeCompare(b[0]));
  return { ok: true, value: tuples };
}

async function walkVault(
  options: PathSecurityOptions,
  depthLimit: number,
  collect: (relativePath: string, isDirectory: boolean) => boolean,
): Promise<string[]> {
  const effectiveLimit = depthLimit === 0 ? Infinity : depthLimit;
  const searchRoots =
    options.allowed.length > 0
      ? options.allowed.map((f) => path.resolve(options.vaultRoot, f))
      : [options.vaultRoot];

  const results: string[] = [];

  for (const root of searchRoots) {
    if (root === options.vaultRoot) continue;
    const rel = path.relative(options.vaultRoot, root);
    if (collect(rel, true)) results.push(rel);
  }

  let queue: [string, number][] = searchRoots.map((dir) => [dir, 1]);

  while (queue.length > 0) {
    const nextQueue: [string, number][] = [];

    for (const [dir, depth] of queue) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;

        const childAbsolute = path.join(dir, entry.name);
        if (!checkAllowedFolder(childAbsolute, options).ok) continue;

        const relativePath = path.relative(options.vaultRoot, childAbsolute);
        const isDir = entry.isDirectory();

        if (collect(relativePath, isDir)) {
          results.push(relativePath);
        }

        if (isDir && depth < effectiveLimit) {
          nextQueue.push([childAbsolute, depth + 1]);
        }
      }
    }

    queue = nextQueue;
  }

  results.sort();
  return results;
}

export async function listMarkdownFiles(
  options: PathSecurityOptions,
  depthLimit = 0,
): Promise<VFSResult<string[]>> {
  const files = await walkVault(
    options,
    depthLimit,
    (rel, isDir) => !isDir && rel.toLowerCase().endsWith(".md"),
  );
  return { ok: true, value: files };
}

export async function listFolders(
  options: PathSecurityOptions,
  depthLimit = 0,
): Promise<VFSResult<string[]>> {
  const folders = await walkVault(options, depthLimit, (_, isDir) => isDir);
  return { ok: true, value: folders };
}

/**
 * Return metadata for a single file or directory.
 */
export async function statVirtualFile(
  virtualPath: string,
  options: PathSecurityOptions,
): Promise<VFSResult<VFSFileStat>> {
  const pathResult = await validatePath(virtualPath, options);
  if (!pathResult.ok) return pathResult;

  try {
    const stats = await stat(pathResult.value);
    return {
      ok: true,
      value: {
        type: stats.isDirectory() ? "directory" : "file",
        mtime: stats.mtimeMs,
        ctime: stats.ctimeMs,
        size: stats.size,
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === ERRNO.ENOENT) {
      return {
        ok: false,
        error: { code: ERR.FILE_NOT_FOUND, message: `File does not exist: ${virtualPath}` },
      };
    }
    return {
      ok: false,
      error: { code: ERR.CLI_ERROR, message: (err as Error).message },
    };
  }
}
