import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { PathSecurityOptions } from "./path-security.js";
import { canonicalizePath, checkAllowedFolder, validatePath } from "./path-security.js";
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
