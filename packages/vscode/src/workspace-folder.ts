import { readdir } from "node:fs/promises";
import path from "node:path";

import * as vscode from "vscode";

import { canonicalizePath } from "@obsidian-vfs/core";

import { SCHEME } from "./uri-adapter.js";

/** Result of attempting to add the vault as a workspace folder. */
export type AddWorkspaceFolderResult =
  | { readonly status: "added" }
  | { readonly status: "already-present" }
  | { readonly status: "skipped"; readonly reason: string };

/** Name prefix for Obsidian-managed workspace folders. */
export const FOLDER_NAME_PREFIX = `${SCHEME}://`;

/** Check whether a workspace folder is managed by this extension. */
function isObsidianManagedFolder(folder: vscode.WorkspaceFolder, physicalPath: string): boolean {
  if (folder.uri.scheme === SCHEME) return true;
  if (folder.uri.scheme !== "file") return false;
  const fsPath = folder.uri.fsPath;
  const relative = path.relative(physicalPath, fsPath);
  const isUnderVault = canonicalizePath(relative, physicalPath).ok;
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

/** Add the vault path to `git.ignoredRepositories` so VSCode's Git extension skips it. */
export function excludeVaultFromGitDetection(physicalPath: string): Thenable<void> {
  const gitConfig = vscode.workspace.getConfiguration("git");
  const ignored = gitConfig.get<string[]>("ignoredRepositories", []);
  if (ignored.includes(physicalPath)) return Promise.resolve();
  return gitConfig.update(
    "ignoredRepositories",
    [...ignored, physicalPath],
    vscode.ConfigurationTarget.Global,
  );
}

/** Remove the vault path from `git.ignoredRepositories`. */
export function includeVaultInGitDetection(physicalPath: string): Thenable<void> {
  const gitConfig = vscode.workspace.getConfiguration("git");
  const ignored = gitConfig.get<string[]>("ignoredRepositories", []);
  const filtered = ignored.filter((p) => p !== physicalPath);
  if (filtered.length === ignored.length) return Promise.resolve();
  return gitConfig.update(
    "ignoredRepositories",
    filtered.length > 0 ? filtered : undefined,
    vscode.ConfigurationTarget.Global,
  );
}

/**
 * Add the vault as a single `file://` workspace folder at the vault root.
 * Appends at the end to avoid extension host restart.
 */
export function addVaultWorkspaceFolder(
  physicalPath: string,
  vaultName: string,
): AddWorkspaceFolderResult {
  if (hasVaultWorkspaceFolder(physicalPath)) {
    return { status: "already-present" };
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0 || !folders.some((f) => f.uri.scheme === "file")) {
    return { status: "skipped", reason: "no local workspace folder open" };
  }

  vscode.workspace.updateWorkspaceFolders(folders.length, 0, {
    uri: vscode.Uri.file(physicalPath),
    name: `${FOLDER_NAME_PREFIX}${vaultName}`,
  });

  return { status: "added" };
}

/**
 * Scan the vault root and update `files.exclude` to hide non-autoMount entries
 * and blocked paths. Preserves user-set patterns. Returns managed pattern keys.
 */
export async function syncFilesExclude(
  physicalPath: string,
  autoMount: readonly string[],
  blocked: readonly string[],
  previouslyManaged: readonly string[],
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(physicalPath);
  } catch {
    return [...previouslyManaged];
  }
  const autoMountRoots = new Set(autoMount.map((p) => p.split("/")[0]));

  const toExclude: string[] = [];

  for (const entry of entries) {
    if (!autoMountRoots.has(entry)) toExclude.push(entry);
  }

  for (const b of blocked) {
    if (!toExclude.includes(b)) toExclude.push(b);
  }

  const managed = new Set(toExclude);

  const filesConfig = vscode.workspace.getConfiguration("files");
  const current = filesConfig.get<Record<string, boolean>>("exclude", {});
  const updated = { ...current };

  for (const key of previouslyManaged) {
    if (!managed.has(key)) {
      delete updated[key];
    }
  }

  for (const entry of toExclude) {
    updated[entry] = true;
  }

  await filesConfig.update("exclude", updated, vscode.ConfigurationTarget.Workspace);

  return toExclude;
}

/** Remove all extension-managed `files.exclude` patterns from workspace settings. */
export async function clearManagedExcludes(previouslyManaged: readonly string[]): Promise<void> {
  if (previouslyManaged.length === 0) return;

  const filesConfig = vscode.workspace.getConfiguration("files");
  const current = filesConfig.get<Record<string, boolean>>("exclude", {});
  const updated = { ...current };

  for (const key of previouslyManaged) {
    delete updated[key];
  }

  const hasKeys = Object.keys(updated).length > 0;
  await filesConfig.update(
    "exclude",
    hasKeys ? updated : undefined,
    vscode.ConfigurationTarget.Workspace,
  );
}
