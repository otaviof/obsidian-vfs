import * as vscode from "vscode";

import { bootstrapFromConfig, readConfig } from "./bootstrap.js";
import { SCHEME } from "./uri-adapter.js";
import { registerCommands } from "./commands.js";
import { ObsidianFileSystemProvider } from "./file-system-provider.js";
import { StatusBarManager } from "./status-bar.js";
import { VaultTreeDataProvider } from "./vault-tree-provider.js";
import { WikilinkDocumentLinkProvider } from "./wikilink-provider.js";
import {
  FOLDER_NAME_PREFIX,
  addVaultWorkspaceFolder,
  excludeVaultFromGitDetection,
  includeVaultInGitDetection,
  removeVaultWorkspaceFolders,
} from "./workspace-folder.js";

/** Activate the Obsidian VFS extension. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Obsidian VFS");
  context.subscriptions.push(outputChannel);

  const result = await bootstrapFromConfig();
  if (!result.ok) {
    outputChannel.appendLine(`Obsidian VFS: bootstrap failed — ${result.error.message}`);
    outputChannel.appendLine("Extension active but provider unavailable.");
    return;
  }

  const { tracker, initMs } = result.value;
  outputChannel.appendLine(
    `Obsidian VFS: vault "${tracker.context.name}" loaded in ${initMs.toFixed(0)}ms`,
  );

  const provider = new ObsidianFileSystemProvider(tracker);
  context.subscriptions.push(provider);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(SCHEME, provider, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );

  const watcher = provider.watch(vscode.Uri.from({ scheme: SCHEME, path: "/" }));
  context.subscriptions.push(watcher);

  const treeProvider = new VaultTreeDataProvider(tracker);
  context.subscriptions.push(treeProvider);
  const treeView = vscode.window.createTreeView("obsidianVFS", { treeDataProvider: treeProvider });
  const cfg = vscode.workspace.getConfiguration("obsidianVFS");
  treeView.title =
    cfg.get<string>("treeViewTitle", "") || `${FOLDER_NAME_PREFIX}${tracker.context.name}`;
  context.subscriptions.push(treeView);

  await vscode.commands.executeCommand("setContext", "obsidianVFS.active", true);

  registerCommands(context, tracker, treeProvider, outputChannel);

  const statusBar = new StatusBarManager(tracker);
  context.subscriptions.push(statusBar);

  const wikilinkProvider = new WikilinkDocumentLinkProvider(tracker);
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      [
        { scheme: SCHEME, language: "markdown" },
        { scheme: "file", language: "markdown" },
      ],
      wikilinkProvider,
    ),
  );

  const config = readConfig();

  await vscode.commands.executeCommand("setContext", "obsidianVFS.explorerEnabled", config.explorer);
  if (config.statusBar) {
    statusBar.show();
  }
  if (config.workspace) {
    const wfResult = addVaultWorkspaceFolder(tracker.context.physicalPath, config.autoMount);
    const detail = "reason" in wfResult ? ` — ${wfResult.reason}` : "";
    outputChannel.appendLine(`Workspace folder: ${wfResult.status}${detail}`);
    await excludeVaultFromGitDetection(tracker.context.physicalPath);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      const updated = readConfig();
      if (e.affectsConfiguration("obsidianVFS.explorer")) {
        void vscode.commands.executeCommand(
          "setContext",
          "obsidianVFS.explorerEnabled",
          updated.explorer,
        );
      }
      if (e.affectsConfiguration("obsidianVFS.statusBar")) {
        if (updated.statusBar) {
          statusBar.show();
        } else {
          statusBar.hide();
        }
      }
      if (
        e.affectsConfiguration("obsidianVFS.workspace") ||
        e.affectsConfiguration("obsidianVFS.autoMount")
      ) {
        removeVaultWorkspaceFolders(tracker.context.physicalPath);
        if (updated.workspace) {
          addVaultWorkspaceFolder(tracker.context.physicalPath, updated.autoMount);
          void excludeVaultFromGitDetection(tracker.context.physicalPath);
        } else {
          void includeVaultInGitDetection(tracker.context.physicalPath);
        }
      }
    }),
  );
}

/** Deactivate the Obsidian VFS extension. */
export function deactivate(): void {
  // Cleanup handled by disposables in context.subscriptions
}
