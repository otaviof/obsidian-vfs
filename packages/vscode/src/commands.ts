import { constants } from "node:fs";
import { copyFile, unlink } from "node:fs/promises";
import path from "node:path";

import * as vscode from "vscode";
import type { LocalIndexTracker, PathSecurityOptions } from "@obsidian-vfs/core";
import { buildObsUri, VAULT_MODE, validatePathForWrite } from "@obsidian-vfs/core";

import { COMMAND, CONFIG_KEY, CONFIG_PROP, CONFIG_SECTION } from "./types.js";
import { SCHEME, toFileUri, toVaultPath, toVaultPathFromFile } from "./uri-adapter.js";
import type { VaultTreeDataProvider } from "./vault-tree-provider.js";
import { readAutoMount } from "./vault-tree-provider.js";

function readDepthLimit(): number {
  return vscode.workspace.getConfiguration().get<number>(CONFIG_KEY.depthLimit)!;
}

function resolveVaultPath(physicalPath: string): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme === SCHEME) return toVaultPath(editor.document.uri);
  if (editor?.document.uri.scheme === "file")
    return toVaultPathFromFile(editor.document.uri, physicalPath);
  return undefined;
}

function resolveFileUri(resourceUri?: vscode.Uri): vscode.Uri | undefined {
  if (resourceUri?.scheme === "file") return resourceUri;
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme === "file") return editor.document.uri;
  return undefined;
}

// mountCommand adds extensionless folder paths; mountNoteCommand adds .md file paths.
function mountedFolders(): string[] {
  return readAutoMount().filter((e) => !path.extname(e));
}

/** Add a folder to `obsidianVFS.autoMount` and refresh the tree. */
async function mountCommand(
  tracker: LocalIndexTracker,
  treeProvider: VaultTreeDataProvider,
): Promise<void> {
  const result = await tracker.listFolders(readDepthLimit());
  if (!result.ok || result.value.length === 0) return;

  const mounted = new Set(readAutoMount());
  const available = result.value.filter((f) => !mounted.has(f));
  if (available.length === 0) return;

  const picked = await vscode.window.showQuickPick(
    available.map((f) => `${f}/`),
    { placeHolder: "Select a vault folder to mount" },
  );
  if (!picked) return;

  const folder = picked.replace(/\/$/, "");
  const updated = [...mounted, folder];
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(CONFIG_PROP.autoMount, updated, vscode.ConfigurationTarget.Workspace);

  treeProvider.refresh();
}

/** Add a single note to `obsidianVFS.autoMount` and refresh the tree. */
async function mountNoteCommand(
  tracker: LocalIndexTracker,
  treeProvider: VaultTreeDataProvider,
): Promise<void> {
  const result = await tracker.listFiles(readDepthLimit());
  if (!result.ok || result.value.length === 0) return;

  const mounted = new Set(readAutoMount());
  const available = result.value.filter((f) => !mounted.has(f));
  if (available.length === 0) return;

  const items = available.map((filePath) => ({
    // Safe: split("/") always returns at least one element
    label: filePath.replace(/\.md$/i, "").split("/").pop()!,
    description: filePath,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a vault note to mount",
    matchOnDescription: true,
  });
  if (!picked?.description) return;

  const updated = [...mounted, picked.description];
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(CONFIG_PROP.autoMount, updated, vscode.ConfigurationTarget.Workspace);

  treeProvider.refresh();
}

/** Remove an entry from `obsidianVFS.autoMount` and refresh the tree. */
async function unmountCommand(treeProvider: VaultTreeDataProvider): Promise<void> {
  const mounted = readAutoMount();
  if (mounted.length === 0) {
    await vscode.window.showInformationMessage("No Obsidian VFS entries mounted");
    return;
  }

  const picked = await vscode.window.showQuickPick(mounted, {
    placeHolder: "Select an entry to unmount",
  });
  if (!picked) return;

  const updated = mounted.filter((f) => f !== picked);
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(CONFIG_PROP.autoMount, updated, vscode.ConfigurationTarget.Workspace);

  treeProvider.refresh();
}

/** Open the active Obsidian VFS file in the Obsidian desktop app. */
async function openInObsidianCommand(
  tracker: LocalIndexTracker,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const vaultPath = resolveVaultPath(tracker.context.physicalPath);
  if (!vaultPath) {
    await vscode.window.showInformationMessage("No Obsidian VFS file active");
    return;
  }

  const result = await tracker.cli.open(vaultPath);
  if (!result.ok) {
    outputChannel.appendLine(`Open in Obsidian failed: ${result.error.message}`);
    await vscode.window.showInformationMessage("Could not open in Obsidian (is Obsidian running?)");
  }
}

/** Copy the active file's `obs://` URI to the clipboard. */
async function copyPathCommand(tracker: LocalIndexTracker): Promise<void> {
  const vaultPath = resolveVaultPath(tracker.context.physicalPath);
  if (!vaultPath) {
    await vscode.window.showInformationMessage("No Obsidian VFS file active");
    return;
  }

  const obsUri = buildObsUri({
    vaultName: tracker.context.name,
    path: vaultPath,
    section: undefined,
  });
  await vscode.env.clipboard.writeText(obsUri);
}

/** Search vault notes via Quick Pick and open the selected file. */
async function searchNotesCommand(tracker: LocalIndexTracker): Promise<void> {
  const result = await tracker.listFiles(readDepthLimit());
  if (!result.ok || result.value.length === 0) return;

  const items = result.value.map((filePath) => ({
    // Safe: split("/") always returns at least one element
    label: filePath.replace(/\.md$/i, "").split("/").pop()!,
    description: filePath,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Search vault notes",
    matchOnDescription: true,
  });
  if (!picked) return;

  const uri = toFileUri(picked.description, tracker.context.physicalPath);
  await vscode.commands.executeCommand("vscode.open", uri);
}

interface VaultTransferOptions {
  readonly verb: string;
  readonly errorVerb: string;
  readonly logPrefix: string;
  readonly deleteSource: boolean;
}

/**
 * Transfer a file from the current project into the Obsidian vault.
 * Used by both move and duplicate commands.
 */
async function transferToVault(
  tracker: LocalIndexTracker,
  outputChannel: vscode.OutputChannel,
  options: VaultTransferOptions,
  resourceUri?: vscode.Uri,
): Promise<void> {
  const sourceUri = resolveFileUri(resourceUri);
  if (!sourceUri) {
    await vscode.window.showInformationMessage("No file selected");
    return;
  }

  const vaultMode = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(CONFIG_PROP.vaultMode);
  if (vaultMode === VAULT_MODE.RO) {
    await vscode.window.showErrorMessage("Vault is in read-only mode.");
    return;
  }

  const folders = mountedFolders();
  if (folders.length === 0) {
    await vscode.window.showInformationMessage(
      "No mounted folders available. Mount a folder first.",
    );
    return;
  }

  const items = folders.map((f) => ({
    label: f.split("/").pop()!,
    description: f,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select destination folder",
  });
  if (!picked) return;

  const sourceFileName = path.basename(sourceUri.fsPath);
  const fileName = await vscode.window.showInputBox({
    value: sourceFileName,
    prompt: `File name in "${picked.description}"`,
    validateInput: (v) => {
      if (!v.trim()) return "File name cannot be empty";
      if (v.includes("/") || v.includes("\\")) return "File name cannot contain path separators";
      return undefined;
    },
  });
  if (!fileName) return;

  const destVaultPath = `${picked.description}/${fileName}`;
  const statResult = await tracker.stat(destVaultPath);
  if (statResult.ok) {
    await vscode.window.showErrorMessage(`"${fileName}" already exists in "${picked.description}/"`);
    return;
  }

  const securityOptions: PathSecurityOptions = {
    vaultRoot: tracker.context.physicalPath,
    allowed: tracker.context.vfsConfig.allowed,
    blocked: tracker.context.vfsConfig.blocked,
  };
  const pathResult = await validatePathForWrite(destVaultPath, securityOptions);
  if (!pathResult.ok) {
    outputChannel.appendLine(`${options.logPrefix} blocked: ${pathResult.error.message}`);
    await vscode.window.showErrorMessage(pathResult.error.message);
    return;
  }

  try {
    await copyFile(sourceUri.fsPath, pathResult.value, constants.COPYFILE_EXCL);
    if (options.deleteSource) {
      await unlink(sourceUri.fsPath);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`${options.logPrefix} failed: ${msg}`);
    await vscode.window.showErrorMessage(`Failed to ${options.errorVerb} file: ${msg}`);
    return;
  }

  const destFileUri = toFileUri(destVaultPath, tracker.context.physicalPath);
  const action = await vscode.window.showInformationMessage(
    `${options.verb} "${fileName}" to "${picked.description}/"`,
    "Open in Vault",
  );
  if (action === "Open in Vault") {
    await vscode.commands.executeCommand("vscode.open", destFileUri);
  }
}

async function moveIntoVaultCommand(
  tracker: LocalIndexTracker,
  outputChannel: vscode.OutputChannel,
  resourceUri?: vscode.Uri,
): Promise<void> {
  return transferToVault(
    tracker,
    outputChannel,
    {
      verb: "Moved",
      errorVerb: "move",
      logPrefix: "Move into vault",
      deleteSource: true,
    },
    resourceUri,
  );
}

async function duplicateIntoVaultCommand(
  tracker: LocalIndexTracker,
  outputChannel: vscode.OutputChannel,
  resourceUri?: vscode.Uri,
): Promise<void> {
  return transferToVault(
    tracker,
    outputChannel,
    {
      verb: "Duplicated",
      errorVerb: "duplicate",
      logPrefix: "Duplicate into vault",
      deleteSource: false,
    },
    resourceUri,
  );
}

/** Register all Obsidian VFS commands with the extension context. */
export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: LocalIndexTracker,
  treeProvider: VaultTreeDataProvider,
  outputChannel: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND.mount, () => mountCommand(tracker, treeProvider)),
    vscode.commands.registerCommand(COMMAND.mountNote, () =>
      mountNoteCommand(tracker, treeProvider),
    ),
    vscode.commands.registerCommand(COMMAND.unmount, () => unmountCommand(treeProvider)),
    vscode.commands.registerCommand(COMMAND.openInObsidian, () =>
      openInObsidianCommand(tracker, outputChannel),
    ),
    vscode.commands.registerCommand(COMMAND.searchNotes, () => searchNotesCommand(tracker)),
    vscode.commands.registerCommand(COMMAND.copyPath, () => copyPathCommand(tracker)),
    vscode.commands.registerCommand(COMMAND.moveIntoVault, (uri?: vscode.Uri) =>
      moveIntoVaultCommand(tracker, outputChannel, uri),
    ),
    vscode.commands.registerCommand(COMMAND.duplicateIntoVault, (uri?: vscode.Uri) =>
      duplicateIntoVaultCommand(tracker, outputChannel, uri),
    ),
  );
}
