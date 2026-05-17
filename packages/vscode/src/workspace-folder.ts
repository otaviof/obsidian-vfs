import type { Dirent } from "node:fs";
import fs from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import * as vscode from "vscode";

import type { MountNode } from "@obsidian-vfs/core";
import { buildMountTree, canonicalizePath } from "@obsidian-vfs/core";

import { SCHEME } from "./uri-adapter.js";

/** Find the vault's workspace folder by matching `file://` scheme + fsPath. */
function findVaultWorkspaceFolder(physicalPath: string): vscode.WorkspaceFolder | undefined {
  return (vscode.workspace.workspaceFolders ?? []).find(
    (f) => f.uri.scheme === "file" && f.uri.fsPath === physicalPath,
  );
}

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
 * and blocked paths. Patterns are split into two tiers:
 *
 * - **Folder-scoped** (`WorkspaceFolder` → `<vault>/.vscode/settings.json`):
 *   dotfiles and `blocked` paths — vault-global, independent of `autoMount`.
 * - **Workspace-scoped** (`Workspace`): remaining non-autoMount top-level
 *   directories — workspace-specific, varies per `autoMount` config.
 *
 * Returns all managed pattern keys (both tiers combined).
 */
export async function syncFilesExclude(
  physicalPath: string,
  autoMount: readonly string[],
  blocked: readonly string[],
  previouslyManaged: readonly string[],
  excludeFilePattern = "",
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(physicalPath);
  } catch {
    return [...previouslyManaged];
  }
  const mountTree = buildMountTree(autoMount);

  let fileRegex: RegExp | null = null;
  if (excludeFilePattern) {
    try {
      fileRegex = new RegExp(excludeFilePattern);
    } catch {
      // Invalid regex — skip file exclusion
    }
  }

  const folderScoped: string[] = [];
  const workspaceScoped: string[] = [];

  for (const entry of entries) {
    if (entry === ".vscode") continue;
    if (entry.startsWith(".")) {
      folderScoped.push(entry);
      continue;
    }

    const node = mountTree.get(entry);
    if (node === undefined) {
      workspaceScoped.push(entry);
    } else if (node !== null) {
      const subExclusions = await enumeratePartialMounts(physicalPath, entry, node, fileRegex);
      for (const ex of subExclusions) {
        if (ex.includes("*")) {
          folderScoped.push(ex);
        } else {
          workspaceScoped.push(ex);
        }
      }
    }
  }

  for (const b of blocked) {
    if (!folderScoped.includes(b)) folderScoped.push(b);
  }

  const allManaged = [...folderScoped, ...workspaceScoped];
  const managedSet = new Set(allManaged);

  // Tier 1: folder-scoped patterns (dotfiles + blocked)
  const vaultFolder = findVaultWorkspaceFolder(physicalPath);
  if (vaultFolder) {
    const folderConfig = vscode.workspace.getConfiguration("files", vaultFolder.uri);
    const current =
      folderConfig.inspect<Record<string, boolean>>("exclude")?.workspaceFolderValue ?? {};
    const updated = { ...current };

    for (const key of previouslyManaged) {
      if (!managedSet.has(key)) delete updated[key];
    }
    for (const entry of folderScoped) {
      updated[entry] = true;
    }

    await folderConfig.update("exclude", updated, vscode.ConfigurationTarget.WorkspaceFolder);
  } else {
    // No vault workspace folder — fall back to workspace tier for all patterns
    workspaceScoped.push(...folderScoped);
  }

  // Tier 2: workspace-scoped patterns (non-autoMount non-dotfile dirs,
  // plus folderScoped fallback when vault is not a workspace folder)
  const wsConfig = vscode.workspace.getConfiguration("files");
  const wsCurrent = wsConfig.inspect<Record<string, boolean>>("exclude")?.workspaceValue ?? {};
  const wsUpdated = { ...wsCurrent };

  for (const key of previouslyManaged) {
    if (!managedSet.has(key)) delete wsUpdated[key];
  }
  for (const entry of workspaceScoped) {
    wsUpdated[entry] = true;
  }

  // Migrate: remove folder-scoped patterns that were previously at workspace level
  if (vaultFolder) {
    for (const entry of folderScoped) {
      if (entry in wsUpdated) delete wsUpdated[entry];
    }
  }

  const wsHasKeys = Object.keys(wsUpdated).length > 0;
  if (wsHasKeys || Object.keys(wsCurrent).length > 0) {
    await wsConfig.update(
      "exclude",
      wsHasKeys ? wsUpdated : undefined,
      vscode.ConfigurationTarget.Workspace,
    );
  }

  const previousSet = new Set(previouslyManaged);
  const combinedKeys = new Set([...managedSet, ...previousSet]);
  await cleanStaleNonVaultExcludes(physicalPath, combinedKeys);

  return allManaged;
}

/** Result of attempting to generate a `.code-workspace` file. */
export interface GenerateWorkspaceFileResult {
  readonly status: "created" | "already-exists";
  readonly fileUri: vscode.Uri;
}

/** Generate a `.code-workspace` file named after the project root. */
export function generateWorkspaceFile(
  physicalPath: string,
  vaultName: string,
): GenerateWorkspaceFileResult {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const localFolders = folders.filter((f) => f.uri.scheme === "file");
  if (localFolders.length === 0) {
    throw new Error("No local workspace folder open");
  }

  const projectRoot = localFolders[0].uri.fsPath;
  const projectName = path.basename(projectRoot);
  const filePath = path.join(projectRoot, `${projectName}.code-workspace`);
  const fileUri = vscode.Uri.file(filePath);

  if (fs.existsSync(filePath)) {
    return { status: "already-exists", fileUri };
  }

  const localEntries = localFolders.map((f, i) => {
    if (i === 0) return { path: "." };
    const rel = path.relative(projectRoot, f.uri.fsPath);
    return rel.startsWith("..") ? { path: f.uri.fsPath } : { path: rel };
  });

  let settings: Record<string, unknown> | undefined;
  const settingsPath = path.join(projectRoot, ".vscode", "settings.json");
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    delete parsed["files.exclude"];
    if (Object.keys(parsed).length > 0) settings = parsed;
  } catch {
    // No .vscode/settings.json or invalid JSON — start with empty settings
  }

  const content: Record<string, unknown> = {
    folders: [
      ...localEntries,
      {
        path: physicalPath,
        name: `${FOLDER_NAME_PREFIX}${vaultName}`,
      },
    ],
  };
  if (settings) {
    content.settings = settings;
  }

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n");
  return { status: "created", fileUri };
}

/** Open a `.code-workspace` file, triggering a window reload. */
export async function openWorkspaceFile(fileUri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand("vscode.openFolder", fileUri);
}

/** Remove all extension-managed `files.exclude` patterns from folder and workspace settings. */
export async function clearManagedExcludes(
  physicalPath: string,
  previouslyManaged: readonly string[],
): Promise<void> {
  if (previouslyManaged.length === 0) return;

  const prevSet = new Set(previouslyManaged);

  // Clean folder-scoped patterns (dotfiles + blocked)
  const vaultFolder = findVaultWorkspaceFolder(physicalPath);
  if (vaultFolder) {
    const folderConfig = vscode.workspace.getConfiguration("files", vaultFolder.uri);
    const folderPatterns =
      folderConfig.inspect<Record<string, boolean>>("exclude")?.workspaceFolderValue;
    if (folderPatterns) {
      const cleaned = { ...folderPatterns };
      for (const key of previouslyManaged) {
        delete cleaned[key];
      }
      const hasKeys = Object.keys(cleaned).length > 0;
      await folderConfig.update(
        "exclude",
        hasKeys ? cleaned : undefined,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
    }
  }

  // Clean workspace-scoped patterns (non-autoMount dirs)
  const wsConfig = vscode.workspace.getConfiguration("files");
  const wsPatterns = wsConfig.inspect<Record<string, boolean>>("exclude")?.workspaceValue;
  if (wsPatterns) {
    const cleaned = { ...wsPatterns };
    let changed = false;
    for (const key of Object.keys(cleaned)) {
      if (prevSet.has(key)) {
        delete cleaned[key];
        changed = true;
      }
    }
    if (changed) {
      const hasKeys = Object.keys(cleaned).length > 0;
      await wsConfig.update(
        "exclude",
        hasKeys ? cleaned : undefined,
        vscode.ConfigurationTarget.Workspace,
      );
    }
  }

  await cleanStaleNonVaultExcludes(physicalPath, prevSet);
}

async function enumeratePartialMounts(
  basePath: string,
  prefix: string,
  node: MountNode,
  fileRegex: RegExp | null,
): Promise<string[]> {
  const excluded: string[] = [];
  let children: Dirent[];
  try {
    children = await readdir(path.join(basePath, prefix), { withFileTypes: true });
  } catch {
    return excluded;
  }

  const fileExtensions = new Set<string>();

  for (const child of children) {
    if (child.name.startsWith(".")) continue;
    const childPath = `${prefix}/${child.name}`;

    if (!child.isDirectory()) {
      if (fileRegex?.test(child.name)) {
        const ext = path.extname(child.name);
        if (ext) {
          fileExtensions.add(ext);
        } else {
          excluded.push(childPath);
        }
      }
      continue;
    }

    const childNode = node.get(child.name);
    if (childNode === undefined) {
      excluded.push(childPath);
    } else if (childNode !== null) {
      excluded.push(...(await enumeratePartialMounts(basePath, childPath, childNode, fileRegex)));
    }
  }

  for (const ext of fileExtensions) {
    excluded.push(`${prefix}/*${ext}`);
  }

  return excluded;
}

async function cleanStaleNonVaultExcludes(
  physicalPath: string,
  keysToRemove: ReadonlySet<string>,
): Promise<void> {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== "file" || folder.uri.fsPath === physicalPath) continue;
    const folderConfig = vscode.workspace.getConfiguration("files", folder.uri);
    const folderPatterns =
      folderConfig.inspect<Record<string, boolean>>("exclude")?.workspaceFolderValue;
    if (!folderPatterns) continue;

    const cleaned = { ...folderPatterns };
    let changed = false;
    for (const key of Object.keys(cleaned)) {
      if (keysToRemove.has(key)) {
        delete cleaned[key];
        changed = true;
      }
    }
    if (changed) {
      const hasKeys = Object.keys(cleaned).length > 0;
      await folderConfig.update(
        "exclude",
        hasKeys ? cleaned : undefined,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
    }
  }
}
