import path from "node:path";

import * as vscode from "vscode";
import { VAULT_MODE } from "@obsidian-vfs/core";

import { bootstrapFromConfig, readConfig } from "./bootstrap.js";
import { CONFIG_KEY, CONFIG_PROP, CONFIG_SECTION } from "./types.js";
import type { ExtensionConfig } from "./types.js";
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
import type { SyncFilesExcludeOptions } from "./workspace-folder.js";

const MANAGED_EXCLUDES_KEY = "managedFilesExclude";

/** Mutable state for managed `files.exclude` patterns. */
interface ExcludeState {
  managedExcludes: string[];
  excludeSync: Promise<void>;
}

/** Wrapper for the file system provider registration to allow re-registration on mode change. */
interface ProviderRegistration {
  current: vscode.Disposable;
}

/** Shared context passed to workspace activation and config change helpers. */
interface WorkspaceContext {
  readonly physicalPath: string;
  readonly vaultName: string;
  readonly blocked: readonly string[];
  readonly extensionContext: vscode.ExtensionContext;
  readonly outputChannel: vscode.OutputChannel;
  readonly state: ExcludeState;
}

function buildSyncOptions(config: ExtensionConfig): SyncFilesExcludeOptions {
  return {
    excludeBlocked: config.vaultExcludeBlocked,
    excludeDotfiles: config.vaultExcludeDotfiles,
    excludeDotfilePattern: config.vaultExcludeDotfilePattern,
    excludeUnmountedFolders: config.workspaceExcludeUnmountedFolders,
    excludeUnmountedFiles: config.workspaceExcludeUnmountedFiles,
    excludeUnmountedFilePattern: config.workspaceExcludeUnmountedFilePattern,
  };
}

/** Sync `files.exclude` patterns immediately, updating both tiers and persisting state. */
async function syncExcludesNow(ctx: WorkspaceContext, config: ExtensionConfig): Promise<void> {
  ctx.state.managedExcludes = await syncFilesExclude(
    ctx.physicalPath,
    config.autoMount,
    ctx.blocked,
    ctx.state.managedExcludes,
    buildSyncOptions(config),
  );
  await ctx.extensionContext.workspaceState.update(MANAGED_EXCLUDES_KEY, ctx.state.managedExcludes);
}

/** Enqueue a `files.exclude` sync that runs after any in-flight sync completes. */
function scheduleSync(ctx: WorkspaceContext, config: ExtensionConfig): void {
  ctx.state.excludeSync = ctx.state.excludeSync.then(() => syncExcludesNow(ctx, config));
}

/** Enqueue removal of all managed `files.exclude` patterns. */
function scheduleClear(ctx: WorkspaceContext): void {
  ctx.state.excludeSync = ctx.state.excludeSync.then(async () => {
    await clearManagedExcludes(ctx.physicalPath, ctx.state.managedExcludes);
    ctx.state.managedExcludes = [];
    await ctx.extensionContext.workspaceState.update(MANAGED_EXCLUDES_KEY, []);
  });
}

/** Add the vault as a workspace folder and sync `files.exclude` based on the active mode. */
async function activateWorkspaceFolder(
  ctx: WorkspaceContext,
  config: ExtensionConfig,
): Promise<void> {
  const alreadySaved = vscode.workspace.workspaceFile?.scheme === "file";

  if (config.workspaceCodeWorkspaceFile && alreadySaved && config.autoMount.length > 0) {
    if (config.vaultGitIgnore) await excludeVaultFromGitDetection(ctx.physicalPath);
    await syncExcludesNow(ctx, config);
    return;
  }

  if (config.workspaceCodeWorkspaceFile && !alreadySaved && config.autoMount.length > 0) {
    try {
      if (config.vaultGitIgnore) await excludeVaultFromGitDetection(ctx.physicalPath);
      const wfResult = generateWorkspaceFile(ctx.physicalPath, ctx.vaultName);
      ctx.outputChannel.appendLine(
        `Workspace file: ${wfResult.status} — ${wfResult.fileUri.fsPath}`,
      );
      const action = await vscode.window.showInformationMessage(
        `Workspace file ${wfResult.status === "created" ? "created" : "found"}: ${path.basename(wfResult.fileUri.fsPath)}. Open it? This will reload the window.`,
        "Open",
        "Not Now",
      );
      if (action === "Open") {
        await openWorkspaceFile(wfResult.fileUri);
        return;
      }
      const addResult = addVaultWorkspaceFolder(ctx.physicalPath, ctx.vaultName);
      const detail = "reason" in addResult ? ` — ${addResult.reason}` : "";
      ctx.outputChannel.appendLine(`Workspace folder: ${addResult.status}${detail}`);
      await syncExcludesNow(ctx, config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.outputChannel.appendLine(`Workspace file: skipped — ${msg}`);
    }
    return;
  }

  if (config.workspaceEnabled && config.autoMount.length > 0) {
    const wfResult = addVaultWorkspaceFolder(ctx.physicalPath, ctx.vaultName);
    const detail = "reason" in wfResult ? ` — ${wfResult.reason}` : "";
    ctx.outputChannel.appendLine(`Workspace folder: ${wfResult.status}${detail}`);
    if (config.vaultGitIgnore) await excludeVaultFromGitDetection(ctx.physicalPath);
    await syncExcludesNow(ctx, config);
  }
}

/** React to `onDidChangeConfiguration` events — toggle components and re-sync patterns. */
function handleConfigChange(
  e: vscode.ConfigurationChangeEvent,
  ctx: WorkspaceContext,
  treeProvider: VaultTreeDataProvider,
  statusBar: StatusBarManager,
  provider: ObsidianFileSystemProvider,
  providerReg: ProviderRegistration,
): void {
  const updated = readConfig();

  if (e.affectsConfiguration(CONFIG_KEY.explorerEnabled)) {
    treeProvider.enabled = updated.explorerEnabled;
  }
  if (e.affectsConfiguration(CONFIG_KEY.statusBarEnabled)) {
    if (updated.statusBarEnabled) statusBar.show();
    else statusBar.hide();
  }
  if (e.affectsConfiguration(CONFIG_KEY.autoMount)) {
    provider.setAutoMount(updated.autoMount);
  }
  if (e.affectsConfiguration(CONFIG_KEY.vaultMode)) {
    provider.setVaultMode(updated.vaultMode);
    statusBar.setVaultMode(updated.vaultMode);
    providerReg.current.dispose();
    providerReg.current = vscode.workspace.registerFileSystemProvider(SCHEME, provider, {
      isCaseSensitive: true,
      isReadonly: updated.vaultMode === VAULT_MODE.RO,
    });
    ctx.extensionContext.subscriptions.push(providerReg.current);
  }
  if (e.affectsConfiguration(CONFIG_KEY.vaultGitIgnore)) {
    if (updated.vaultGitIgnore && (updated.workspaceEnabled || updated.workspaceCodeWorkspaceFile)) {
      void excludeVaultFromGitDetection(ctx.physicalPath);
    } else {
      void includeVaultInGitDetection(ctx.physicalPath);
    }
  }
  if (e.affectsConfiguration(CONFIG_KEY.workspaceCodeWorkspaceFile)) {
    const wfAlreadySaved = vscode.workspace.workspaceFile?.scheme === "file";
    if (updated.workspaceCodeWorkspaceFile && !wfAlreadySaved && updated.autoMount.length > 0) {
      try {
        const wfResult = generateWorkspaceFile(ctx.physicalPath, ctx.vaultName);
        ctx.outputChannel.appendLine(
          `Workspace file: ${wfResult.status} — ${wfResult.fileUri.fsPath}`,
        );
        void vscode.window
          .showInformationMessage(
            `Workspace file ${wfResult.status === "created" ? "created" : "found"}: ${path.basename(wfResult.fileUri.fsPath)}. Open it? This will reload the window.`,
            "Open",
            "Not Now",
          )
          .then((action) => {
            if (action === "Open") void openWorkspaceFile(wfResult.fileUri);
          });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.outputChannel.appendLine(`Workspace file: skipped — ${msg}`);
      }
    }
  }
  if (e.affectsConfiguration(CONFIG_KEY.workspaceEnabled) && !updated.workspaceCodeWorkspaceFile) {
    removeVaultWorkspaceFolders(ctx.physicalPath);
    if (updated.workspaceEnabled && updated.autoMount.length > 0) {
      addVaultWorkspaceFolder(ctx.physicalPath, ctx.vaultName);
      if (updated.vaultGitIgnore) void excludeVaultFromGitDetection(ctx.physicalPath);
      scheduleSync(ctx, updated);
    } else {
      scheduleClear(ctx);
      void includeVaultInGitDetection(ctx.physicalPath);
    }
  } else if (
    (e.affectsConfiguration(CONFIG_KEY.autoMount) ||
      e.affectsConfiguration(CONFIG_KEY.workspaceExcludeUnmountedFilePattern) ||
      e.affectsConfiguration(CONFIG_KEY.workspaceExcludeUnmountedFolders) ||
      e.affectsConfiguration(CONFIG_KEY.workspaceExcludeUnmountedFiles) ||
      e.affectsConfiguration(CONFIG_KEY.vaultExcludeBlocked) ||
      e.affectsConfiguration(CONFIG_KEY.vaultExcludeDotfiles) ||
      e.affectsConfiguration(CONFIG_KEY.vaultExcludeDotfilePattern)) &&
    (updated.workspaceEnabled || updated.workspaceCodeWorkspaceFile)
  ) {
    if (updated.autoMount.length === 0) {
      removeVaultWorkspaceFolders(ctx.physicalPath);
      scheduleClear(ctx);
    } else {
      if (!hasVaultWorkspaceFolder(ctx.physicalPath)) {
        addVaultWorkspaceFolder(ctx.physicalPath, ctx.vaultName);
        if (updated.vaultGitIgnore) void excludeVaultFromGitDetection(ctx.physicalPath);
      }
      scheduleSync(ctx, updated);
    }
  }
}

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

  const provider = new ObsidianFileSystemProvider(tracker, config.autoMount, config.vaultMode);
  context.subscriptions.push(provider);
  const providerReg: ProviderRegistration = {
    current: vscode.workspace.registerFileSystemProvider(SCHEME, provider, {
      isCaseSensitive: true,
      isReadonly: config.vaultMode === VAULT_MODE.RO,
    }),
  };
  context.subscriptions.push(providerReg.current);
  context.subscriptions.push(provider.watch(vscode.Uri.from({ scheme: SCHEME, path: "/" })));

  const treeProvider = new VaultTreeDataProvider(tracker);
  context.subscriptions.push(treeProvider);
  const dragAndDropController = new VaultTreeDragAndDropController(tracker.context.name);
  const treeView = vscode.window.createTreeView("obsidianVFS", {
    treeDataProvider: treeProvider,
    dragAndDropController,
  });
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  treeView.title =
    cfg.get<string>(CONFIG_PROP.explorerTitle, "") || `${FOLDER_NAME_PREFIX}${tracker.context.name}`;
  context.subscriptions.push(treeView);
  context.subscriptions.push(
    treeView.onDidChangeVisibility((e) => {
      if (e.visible) treeProvider.refresh();
    }),
  );

  registerCommands(context, tracker, treeProvider, outputChannel);

  const statusBar = new StatusBarManager(tracker);
  statusBar.setVaultMode(config.vaultMode);
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

  treeProvider.enabled = config.explorerEnabled;
  if (config.statusBarEnabled) statusBar.show();

  const wsCtx: WorkspaceContext = {
    physicalPath: tracker.context.physicalPath,
    vaultName: tracker.context.name,
    blocked: tracker.context.vfsConfig.blocked,
    extensionContext: context,
    outputChannel,
    state: {
      managedExcludes: context.workspaceState.get<string[]>(MANAGED_EXCLUDES_KEY, []),
      excludeSync: Promise.resolve(),
    },
  };

  await activateWorkspaceFolder(wsCtx, config);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) =>
      handleConfigChange(e, wsCtx, treeProvider, statusBar, provider, providerReg),
    ),
  );
}

/** Deactivate the Obsidian VFS extension. */
export function deactivate(): void {
  // Cleanup handled by disposables in context.subscriptions
}
