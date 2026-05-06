import * as vscode from "vscode";

import { SCHEME, toVscodeUri } from "./uri-adapter.js";

/** Result of attempting to add the vault as a workspace folder. */
export type AddWorkspaceFolderResult =
  | { readonly status: "added" }
  | { readonly status: "already-present" }
  | { readonly status: "skipped"; readonly reason: string };

/** Check whether an `obs://` workspace folder is already present. */
export function hasVaultWorkspaceFolder(): boolean {
  return (vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.scheme === SCHEME);
}

/** Remove all `obs://` workspace folders. */
export function removeVaultWorkspaceFolders(): void {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (let i = folders.length - 1; i >= 0; i--) {
    if (folders[i].uri.scheme === SCHEME) {
      vscode.workspace.updateWorkspaceFolders(i, 1);
    }
  }
}

/**
 * Add the Obsidian vault as a workspace folder for Explorer browsing.
 * Appends at the end to avoid extension host restart.
 */
export function addVaultWorkspaceFolder(vaultName: string): AddWorkspaceFolderResult {
  if (hasVaultWorkspaceFolder()) {
    return { status: "already-present" };
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0 || !folders.some((f) => f.uri.scheme === "file")) {
    return { status: "skipped", reason: "no local workspace folder open" };
  }

  const uri = toVscodeUri("", vaultName);
  vscode.workspace.updateWorkspaceFolders(folders.length, 0, {
    uri,
    name: `Obsidian: ${vaultName}`,
  });

  return { status: "added" };
}
