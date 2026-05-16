import * as vscode from "vscode";
import type { LocalIndexTracker } from "@obsidian-vfs/core";
import { buildObsUri } from "@obsidian-vfs/core";

import { CONFIG_KEY, CONFIG_SECTION } from "./types.js";
import { SCHEME, toFileUri, toVaultPath, toVaultPathFromFile } from "./uri-adapter.js";
import type { VaultTreeDataProvider } from "./vault-tree-provider.js";
import { readAutoMount } from "./vault-tree-provider.js";

function readDepthLimit(): number {
  return vscode.workspace.getConfiguration().get<number>(CONFIG_KEY.depthLimit)!;
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
    .update("autoMount", updated, vscode.ConfigurationTarget.Workspace);

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
    .update("autoMount", updated, vscode.ConfigurationTarget.Workspace);

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
    .update("autoMount", updated, vscode.ConfigurationTarget.Workspace);

  treeProvider.refresh();
}

/** Open the active Obsidian VFS file in the Obsidian desktop app. */
async function openInObsidianCommand(
  tracker: LocalIndexTracker,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme !== SCHEME && editor?.document.uri.scheme !== "file") {
    await vscode.window.showInformationMessage("No Obsidian VFS file active");
    return;
  }

  const vaultPath =
    editor.document.uri.scheme === SCHEME
      ? toVaultPath(editor.document.uri)
      : toVaultPathFromFile(editor.document.uri, tracker.context.physicalPath);
  const result = await tracker.cli.open(vaultPath);
  if (!result.ok) {
    outputChannel.appendLine(`Open in Obsidian failed: ${result.error.message}`);
    await vscode.window.showInformationMessage("Could not open in Obsidian (is Obsidian running?)");
  }
}

/** Copy the active file's `obs://` URI to the clipboard. */
async function copyPathCommand(tracker: LocalIndexTracker): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme !== SCHEME && editor?.document.uri.scheme !== "file") {
    await vscode.window.showInformationMessage("No Obsidian VFS file active");
    return;
  }

  const vaultPath =
    editor.document.uri.scheme === SCHEME
      ? toVaultPath(editor.document.uri)
      : toVaultPathFromFile(editor.document.uri, tracker.context.physicalPath);

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

/** Register all Obsidian VFS commands with the extension context. */
export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: LocalIndexTracker,
  treeProvider: VaultTreeDataProvider,
  outputChannel: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("obsidianVFS.mount", () => mountCommand(tracker, treeProvider)),
    vscode.commands.registerCommand("obsidianVFS.mountNote", () =>
      mountNoteCommand(tracker, treeProvider),
    ),
    vscode.commands.registerCommand("obsidianVFS.unmount", () => unmountCommand(treeProvider)),
    vscode.commands.registerCommand("obsidianVFS.openInObsidian", () =>
      openInObsidianCommand(tracker, outputChannel),
    ),
    vscode.commands.registerCommand("obsidianVFS.searchNotes", () => searchNotesCommand(tracker)),
    vscode.commands.registerCommand("obsidianVFS.copyPath", () => copyPathCommand(tracker)),
  );
}
