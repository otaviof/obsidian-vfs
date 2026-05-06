import * as vscode from "vscode";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { toVaultPath, toVscodeUri } from "./uri-adapter.js";
import type { VaultTreeDataProvider } from "./vault-tree-provider.js";
import { readAutoMount } from "./vault-tree-provider.js";

/** Add a folder to `obsidianVFS.autoMount` and refresh the tree. */
async function mountCommand(
  tracker: LocalIndexTracker,
  treeProvider: VaultTreeDataProvider,
): Promise<void> {
  const result = await tracker.readDirectory("");
  if (!result.ok) return;

  const folders = result.value.filter(([, type]) => type === "directory").map(([name]) => name);
  if (folders.length === 0) return;

  const mounted = new Set(readAutoMount());
  const available = folders.filter((f) => !mounted.has(f));
  if (available.length === 0) return;

  const picked = await vscode.window.showQuickPick(available, {
    placeHolder: "Select a vault folder to mount",
  });
  if (!picked) return;

  const updated = [...mounted, picked];
  await vscode.workspace
    .getConfiguration("obsidianVFS")
    .update("autoMount", updated, vscode.ConfigurationTarget.Workspace);

  treeProvider.refresh();
}

/** Remove a folder from `obsidianVFS.autoMount` and refresh the tree. */
async function unmountCommand(treeProvider: VaultTreeDataProvider): Promise<void> {
  const mounted = readAutoMount();
  if (mounted.length === 0) {
    await vscode.window.showInformationMessage("No Obsidian VFS folders mounted");
    return;
  }

  const picked = await vscode.window.showQuickPick(mounted, {
    placeHolder: "Select a folder to unmount",
  });
  if (!picked) return;

  const updated = mounted.filter((f) => f !== picked);
  await vscode.workspace
    .getConfiguration("obsidianVFS")
    .update("autoMount", updated, vscode.ConfigurationTarget.Workspace);

  treeProvider.refresh();
}

/** Open the active `obs://` file in the Obsidian desktop app. */
async function openInObsidianCommand(
  tracker: LocalIndexTracker,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme !== "obs") {
    await vscode.window.showInformationMessage("No Obsidian VFS file active");
    return;
  }

  const vaultPath = toVaultPath(editor.document.uri);
  const result = await tracker.cli.open(vaultPath);
  if (!result.ok) {
    outputChannel.appendLine(`Open in Obsidian failed: ${result.error.message}`);
    await vscode.window.showInformationMessage("Could not open in Obsidian (is Obsidian running?)");
  }
}

/** Search vault notes via Quick Pick and open the selected file. */
async function searchNotesCommand(tracker: LocalIndexTracker): Promise<void> {
  const result = await tracker.listFiles();
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

  const uri = toVscodeUri(picked.description, tracker.context.name);
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
    vscode.commands.registerCommand("obsidianVFS.unmount", () => unmountCommand(treeProvider)),
    vscode.commands.registerCommand("obsidianVFS.openInObsidian", () =>
      openInObsidianCommand(tracker, outputChannel),
    ),
    vscode.commands.registerCommand("obsidianVFS.searchNotes", () => searchNotesCommand(tracker)),
  );
}
