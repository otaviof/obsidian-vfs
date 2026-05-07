import path from "node:path";

import * as vscode from "vscode";

import { SCHEME } from "./scheme.js";

export { SCHEME };

/** Convert a `vscode.Uri` with scheme `obs` to a vault-relative path. */
export function toVaultPath(uri: vscode.Uri): string {
  return uri.path.replace(/^\//, "");
}

/** Build a `vscode.Uri` from a vault-relative path and vault name. */
export function toVscodeUri(vaultPath: string, vaultName: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: SCHEME,
    authority: vaultName,
    path: "/" + vaultPath,
  });
}

/** Build a `file://` URI from a vault-relative path and vault physical path. */
export function toFileUri(vaultPath: string, physicalPath: string): vscode.Uri {
  return vscode.Uri.file(path.join(physicalPath, vaultPath));
}

/** Extract vault-relative path from a `file://` URI rooted under the vault. */
export function toVaultPathFromFile(uri: vscode.Uri, physicalPath: string): string {
  return path.relative(physicalPath, uri.fsPath);
}
