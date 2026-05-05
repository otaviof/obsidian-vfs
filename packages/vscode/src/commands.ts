import * as vscode from "vscode";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { toVaultPath, toVscodeUri } from "./uri-adapter.js";

async function mountCommand(tracker: LocalIndexTracker): Promise<void> {
  const result = await tracker.readDirectory("");
  if (!result.ok) return;

  const folders = result.value.filter(([, type]) => type === "directory").map(([name]) => name);

  if (folders.length === 0) return;

  const picked = await vscode.window.showQuickPick(folders, {
    placeHolder: "Select a vault folder to mount",
  });
  if (!picked) return;

  const vaultName = tracker.context.name;
  const uri = toVscodeUri(picked, vaultName);

  const existing = vscode.workspace.workspaceFolders ?? [];
  const alreadyMounted = existing.some(
    (wf) => wf.uri.scheme === "obs" && toVaultPath(wf.uri) === picked,
  );
  if (alreadyMounted) return;

  vscode.workspace.updateWorkspaceFolders(existing.length, 0, {
    uri,
    name: `Obsidian: ${picked}`,
  });
}

async function unmountCommand(): Promise<void> {
  const existing = vscode.workspace.workspaceFolders ?? [];
  const obsFolders = existing.filter((wf) => wf.uri.scheme === "obs");

  if (obsFolders.length === 0) {
    await vscode.window.showInformationMessage("No Obsidian VFS folders mounted");
    return;
  }

  const items = obsFolders.map((wf) => ({ label: wf.name, index: wf.index }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a folder to unmount",
  });
  if (!picked) return;

  vscode.workspace.updateWorkspaceFolders(picked.index, 1);
}

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

/** Register all Obsidian VFS commands with the extension context. */
export function registerCommands(
  context: vscode.ExtensionContext,
  tracker: LocalIndexTracker,
  outputChannel: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("obsidianVFS.mount", () => mountCommand(tracker)),
    vscode.commands.registerCommand("obsidianVFS.unmount", () => unmountCommand()),
    vscode.commands.registerCommand("obsidianVFS.openInObsidian", () =>
      openInObsidianCommand(tracker, outputChannel),
    ),
  );
}
