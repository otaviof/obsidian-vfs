import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { PathSecurityOptions } from "./path-security.js";
import {
  canonicalizePath,
  checkAllowedFolder,
  checkBlockedFolder,
  validatePath,
} from "./path-security.js";
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
    if (code === "ENOENT") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `Directory does not exist: ${virtualPath}` },
      };
    }
    if (code === "ENOTDIR") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `Not a directory: ${virtualPath}` },
      };
    }
    return {
      ok: false,
      error: { code: "CLI_ERROR", message: (err as Error).message },
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

/** Check whether any path segment starts with a dot. */
function hasDotSegment(relativePath: string): boolean {
  return relativePath.split(path.sep).some((seg) => seg.startsWith("."));
}

/**
 * Recursively enumerate all markdown files in the vault.
 */
export async function listMarkdownFiles(options: PathSecurityOptions): Promise<VFSResult<string[]>> {
  const searchDirs =
    options.allowed.length > 0
      ? options.allowed.map((f) => path.resolve(options.vaultRoot, f))
      : [options.vaultRoot];

  const files: string[] = [];

  for (const dir of searchDirs) {
    let entries: string[];
    try {
      entries = await readdir(dir, { recursive: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".md")) continue;
      if (hasDotSegment(entry)) continue;
      files.push(path.relative(options.vaultRoot, path.join(dir, entry)));
    }
  }

  if (options.blocked.length > 0) {
    const filtered = files.filter((f) => {
      const abs = path.resolve(options.vaultRoot, f);
      return checkBlockedFolder(abs, options).ok;
    });
    filtered.sort();
    return { ok: true, value: filtered };
  }

  files.sort();
  return { ok: true, value: files };
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
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `File does not exist: ${virtualPath}` },
      };
    }
    return {
      ok: false,
      error: { code: "CLI_ERROR", message: (err as Error).message },
    };
  }
}
