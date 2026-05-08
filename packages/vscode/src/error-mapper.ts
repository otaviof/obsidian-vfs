import * as vscode from "vscode";
import type { VFSResult } from "@obsidian-vfs/core";

/** Map a failed `VFSResult` to the appropriate `vscode.FileSystemError` and throw. */
export function throwVFSError(result: VFSResult<unknown>, uri: vscode.Uri): never {
  const code = result.ok ? undefined : result.error.code;

  switch (code) {
    case "FILE_NOT_FOUND":
      throw vscode.FileSystemError.FileNotFound(uri);
    case "PERMISSION_DENIED":
      throw vscode.FileSystemError.NoPermissions(uri);
    case "CLI_UNAVAILABLE":
      throw vscode.FileSystemError.Unavailable(uri);
    default:
      throw vscode.FileSystemError.Unavailable(uri);
  }
}

/** Throw a `FileExists` error for `writeFile` overwrite-guard. */
export function throwFileExists(uri: vscode.Uri): never {
  throw vscode.FileSystemError.FileExists(uri);
}
