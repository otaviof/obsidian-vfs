import * as vscode from "vscode";

/** URI scheme used by the Obsidian VFS file system provider. */
const SCHEME = "obs";

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
