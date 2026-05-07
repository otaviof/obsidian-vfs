import path from "node:path";

import * as vscode from "vscode";

import { toFileUri } from "./uri-adapter.js";

/** Result of attempting to add the vault as a workspace folder. */
export type AddWorkspaceFolderResult =
  | { readonly status: "added" }
  | { readonly status: "already-present" }
  | { readonly status: "skipped"; readonly reason: string };

/** Name prefix for Obsidian-managed workspace folders. */
export const FOLDER_NAME_PREFIX = "obs://";

/** Check whether a workspace folder is managed by this extension. */
function isObsidianManagedFolder(folder: vscode.WorkspaceFolder, physicalPath: string): boolean {
  if (folder.uri.scheme === "obs") return true;
  if (folder.uri.scheme !== "file") return false;
  const fsPath = folder.uri.fsPath;
  const isUnderVault = fsPath === physicalPath || fsPath.startsWith(physicalPath + path.sep);
  return folder.name.startsWith(FOLDER_NAME_PREFIX) && isUnderVault;
}

/** Check whether a vault workspace folder is already present. */
export function hasVaultWorkspaceFolder(physicalPath: string): boolean {
  return (vscode.workspace.workspaceFolders ?? []).some((f) =>
    isObsidianManagedFolder(f, physicalPath),
  );
}

/** Remove all vault workspace folders. */
export function removeVaultWorkspaceFolders(physicalPath: string): void {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (let i = folders.length - 1; i >= 0; i--) {
    if (isObsidianManagedFolder(folders[i], physicalPath)) {
      vscode.workspace.updateWorkspaceFolders(i, 1);
    }
  }
}

/**
 * Add autoMount folders as individual workspace folders for Explorer browsing.
 * Appends at the end to avoid extension host restart.
 */
export function addVaultWorkspaceFolder(
  physicalPath: string,
  autoMount: readonly string[],
): AddWorkspaceFolderResult {
  if (autoMount.length === 0) {
    return { status: "skipped", reason: "no autoMount folders configured" };
  }

  if (hasVaultWorkspaceFolder(physicalPath)) {
    return { status: "already-present" };
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0 || !folders.some((f) => f.uri.scheme === "file")) {
    return { status: "skipped", reason: "no local workspace folder open" };
  }

  const newFolders = autoMount.map((folder) => ({
    uri: toFileUri(folder, physicalPath),
    name: `${FOLDER_NAME_PREFIX}${folder}`,
  }));
  vscode.workspace.updateWorkspaceFolders(folders.length, 0, ...newFolders);

  return { status: "added" };
}
