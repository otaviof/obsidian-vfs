import { readFile } from "node:fs/promises";

import type { VFSResult } from "./types.js";
import type { PathSecurityOptions } from "./path-security.js";
import { validatePath } from "./path-security.js";

/**
 * Secure file read from disk. Validates the path against the vault security
 * boundary, then reads via `node:fs`. Returns raw bytes — callers needing text
 * decode with `TextDecoder`. Never touches the CLI. Never throws.
 */
export async function readVirtualFile(
  virtualPath: string,
  options: PathSecurityOptions,
): Promise<VFSResult<Uint8Array>> {
  const pathResult = await validatePath(virtualPath, options);
  if (!pathResult.ok) return pathResult;

  try {
    const buffer = await readFile(pathResult.value);
    return { ok: true, value: buffer };
  } catch (err) {
    const errno = err as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `File does not exist: ${pathResult.value}` },
      };
    }
    if (errno.code === "EACCES") {
      return {
        ok: false,
        error: { code: "PERMISSION_DENIED", message: `Permission denied: ${pathResult.value}` },
      };
    }
    return {
      ok: false,
      error: { code: "CLI_ERROR", message: (err as Error).message },
    };
  }
}
