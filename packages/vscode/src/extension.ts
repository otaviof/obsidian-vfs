import path from "node:path";

import * as vscode from "vscode";

import { bootstrapFromConfig, readConfig } from "./bootstrap.js";
import { CONFIG_KEY, CONFIG_SECTION } from "./types.js";
import { SCHEME } from "./uri-adapter.js";
import { registerCommands } from "./commands.js";
import { ObsidianFileSystemProvider } from "./file-system-provider.js";
import { StatusBarManager } from "./status-bar.js";
import { VaultTreeDragAndDropController } from "./tree-drag-drop.js";
import { VaultTreeDataProvider } from "./vault-tree-provider.js";
import { WikilinkDocumentLinkProvider } from "./wikilink-provider.js";
import {
  FOLDER_NAME_PREFIX,
  addVaultWorkspaceFolder,
  clearManagedExcludes,
  excludeVaultFromGitDetection,
  generateWorkspaceFile,
  hasVaultWorkspaceFolder,
  includeVaultInGitDetection,
  openWorkspaceFile,
  removeVaultWorkspaceFolders,
  syncFilesExclude,
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

  const config = readConfig();

  const provider = new ObsidianFileSystemProvider(tracker, config.autoMount);
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
  const dragAndDropController = new VaultTreeDragAndDropController(tracker.context.name);
  const treeView = vscode.window.createTreeView("obsidianVFS", {
    treeDataProvider: treeProvider,
    dragAndDropController,
  });
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  treeView.title =
    cfg.get<string>("treeViewTitle", "") || `${FOLDER_NAME_PREFIX}${tracker.context.name}`;
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    treeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        treeProvider.refresh();
      }
    }),
  );

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

  treeProvider.enabled = config.explorer;
  if (config.statusBar) {
    statusBar.show();
  }

  const managedExcludesKey = "managedFilesExclude";
  let managedExcludes: string[] = context.workspaceState.get<string[]>(managedExcludesKey, []);
  let excludeSync: Promise<void> = Promise.resolve();

  const { blocked } = tracker.context.vfsConfig;

  const runSync = (autoMount: readonly string[], excludeFilePattern: string): void => {
    excludeSync = excludeSync.then(async () => {
      const keys = await syncFilesExclude(
        tracker.context.physicalPath,
        autoMount,
        blocked,
        managedExcludes,
        excludeFilePattern,
      );
      managedExcludes = keys;
      await context.workspaceState.update(managedExcludesKey, keys);
    });
  };

  const runClear = (): void => {
    excludeSync = excludeSync.then(async () => {
      await clearManagedExcludes(tracker.context.physicalPath, managedExcludes);
      managedExcludes = [];
      await context.workspaceState.update(managedExcludesKey, []);
    });
  };

  const alreadySaved = vscode.workspace.workspaceFile?.scheme === "file";

  if (config.workspaceFile && alreadySaved && config.autoMount.length > 0) {
    await excludeVaultFromGitDetection(tracker.context.physicalPath);
    managedExcludes = await syncFilesExclude(
      tracker.context.physicalPath,
      config.autoMount,
      blocked,
      managedExcludes,
      config.excludeFilePattern,
    );
    await context.workspaceState.update(managedExcludesKey, managedExcludes);
  } else if (config.workspaceFile && !alreadySaved && config.autoMount.length > 0) {
    try {
      await excludeVaultFromGitDetection(tracker.context.physicalPath);

      const wfResult = generateWorkspaceFile(tracker.context.physicalPath, tracker.context.name);
      outputChannel.appendLine(`Workspace file: ${wfResult.status} — ${wfResult.fileUri.fsPath}`);

      const action = await vscode.window.showInformationMessage(
        `Workspace file ${wfResult.status === "created" ? "created" : "found"}: ${path.basename(wfResult.fileUri.fsPath)}. Open it? This will reload the window.`,
        "Open",
        "Not Now",
      );
      if (action === "Open") {
        await openWorkspaceFile(wfResult.fileUri);
        return;
      }
      const addResult = addVaultWorkspaceFolder(tracker.context.physicalPath, tracker.context.name);
      const detail = "reason" in addResult ? ` — ${addResult.reason}` : "";
      outputChannel.appendLine(`Workspace folder: ${addResult.status}${detail}`);
      managedExcludes = await syncFilesExclude(
        tracker.context.physicalPath,
        config.autoMount,
        blocked,
        managedExcludes,
        config.excludeFilePattern,
      );
      await context.workspaceState.update(managedExcludesKey, managedExcludes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Workspace file: skipped — ${msg}`);
    }
  } else if (config.workspace && config.autoMount.length > 0) {
    const wfResult = addVaultWorkspaceFolder(tracker.context.physicalPath, tracker.context.name);
    const detail = "reason" in wfResult ? ` — ${wfResult.reason}` : "";
    outputChannel.appendLine(`Workspace folder: ${wfResult.status}${detail}`);
    await excludeVaultFromGitDetection(tracker.context.physicalPath);
    managedExcludes = await syncFilesExclude(
      tracker.context.physicalPath,
      config.autoMount,
      blocked,
      managedExcludes,
      config.excludeFilePattern,
    );
    await context.workspaceState.update(managedExcludesKey, managedExcludes);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      const updated = readConfig();
      if (e.affectsConfiguration(CONFIG_KEY.explorer)) {
        treeProvider.enabled = updated.explorer;
      }
      if (e.affectsConfiguration(CONFIG_KEY.statusBar)) {
        if (updated.statusBar) {
          statusBar.show();
        } else {
          statusBar.hide();
        }
      }
      if (e.affectsConfiguration(CONFIG_KEY.autoMount)) {
        provider.setAutoMount(updated.autoMount);
      }
      if (e.affectsConfiguration(CONFIG_KEY.workspaceFile)) {
        const wfAlreadySaved = vscode.workspace.workspaceFile?.scheme === "file";
        if (updated.workspaceFile && !wfAlreadySaved && updated.autoMount.length > 0) {
          try {
            const wfResult = generateWorkspaceFile(
              tracker.context.physicalPath,
              tracker.context.name,
            );
            outputChannel.appendLine(
              `Workspace file: ${wfResult.status} — ${wfResult.fileUri.fsPath}`,
            );
            void vscode.window
              .showInformationMessage(
                `Workspace file ${wfResult.status === "created" ? "created" : "found"}: ${path.basename(wfResult.fileUri.fsPath)}. Open it? This will reload the window.`,
                "Open",
                "Not Now",
              )
              .then((action) => {
                if (action === "Open") {
                  void openWorkspaceFile(wfResult.fileUri);
                }
              });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            outputChannel.appendLine(`Workspace file: skipped — ${msg}`);
          }
        }
      }
      if (e.affectsConfiguration(CONFIG_KEY.workspace) && !updated.workspaceFile) {
        removeVaultWorkspaceFolders(tracker.context.physicalPath);
        if (updated.workspace && updated.autoMount.length > 0) {
          addVaultWorkspaceFolder(tracker.context.physicalPath, tracker.context.name);
          void excludeVaultFromGitDetection(tracker.context.physicalPath);
          runSync(updated.autoMount, updated.excludeFilePattern);
        } else {
          runClear();
          void includeVaultInGitDetection(tracker.context.physicalPath);
        }
      } else if (
        (e.affectsConfiguration(CONFIG_KEY.autoMount) ||
          e.affectsConfiguration(CONFIG_KEY.excludeFilePattern)) &&
        (updated.workspace || updated.workspaceFile)
      ) {
        if (updated.autoMount.length === 0) {
          removeVaultWorkspaceFolders(tracker.context.physicalPath);
          runClear();
        } else {
          if (!hasVaultWorkspaceFolder(tracker.context.physicalPath)) {
            addVaultWorkspaceFolder(tracker.context.physicalPath, tracker.context.name);
            void excludeVaultFromGitDetection(tracker.context.physicalPath);
          }
          runSync(updated.autoMount, updated.excludeFilePattern);
        }
      }
    }),
  );
}

/** Deactivate the Obsidian VFS extension. */
export function deactivate(): void {
  // Cleanup handled by disposables in context.subscriptions
}
