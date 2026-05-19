import * as vscode from "vscode";
import { bootstrapTracker, resolveCliPath, VAULT_MODE } from "@obsidian-vfs/core";
import type { BootstrapResult, VaultMode, VFSResult } from "@obsidian-vfs/core";

import { CONFIG_PROP, CONFIG_SECTION } from "./types.js";
import type { ExtensionConfig } from "./types.js";

/** Read extension configuration from VSCode settings. Defaults come from `package.json`. */
export function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    cliPath: resolveCliPath({ userPath: cfg.get<string>(CONFIG_PROP.cliPath)! }),
    timeoutMs: cfg.get<number>(CONFIG_PROP.timeoutMs)!,
    autoMount: cfg.get<string[]>(CONFIG_PROP.autoMount)!,
    depthLimit: cfg.get<number>(CONFIG_PROP.depthLimit)!,
    // Vault
    vaultGitIgnore: cfg.get<boolean>(CONFIG_PROP.vaultGitIgnore)!,
    vaultExcludeBlocked: cfg.get<boolean>(CONFIG_PROP.vaultExcludeBlocked)!,
    vaultExcludeDotfiles: cfg.get<boolean>(CONFIG_PROP.vaultExcludeDotfiles)!,
    vaultExcludeDotfilePattern: cfg.get<string>(CONFIG_PROP.vaultExcludeDotfilePattern)!,
    vaultMode: cfg.get<VaultMode>(CONFIG_PROP.vaultMode, VAULT_MODE.RW),
    // Status Bar
    statusBarEnabled: cfg.get<boolean>(CONFIG_PROP.statusBarEnabled)!,
    // Explorer
    explorerEnabled: cfg.get<boolean>(CONFIG_PROP.explorerEnabled)!,
    explorerContextMenu: cfg.get<boolean>(CONFIG_PROP.explorerContextMenu)!,
    explorerTitle: cfg.get<string>(CONFIG_PROP.explorerTitle)!,
    // Workspace
    workspaceEnabled: cfg.get<boolean>(CONFIG_PROP.workspaceEnabled)!,
    workspaceCodeWorkspaceFile: cfg.get<boolean>(CONFIG_PROP.workspaceCodeWorkspaceFile)!,
    workspaceExcludeUnmountedFolders: cfg.get<boolean>(
      CONFIG_PROP.workspaceExcludeUnmountedFolders,
    )!,
    workspaceExcludeUnmountedFiles: cfg.get<boolean>(CONFIG_PROP.workspaceExcludeUnmountedFiles)!,
    workspaceExcludeUnmountedFilePattern: cfg.get<string>(
      CONFIG_PROP.workspaceExcludeUnmountedFilePattern,
    )!,
  };
}

/** Bootstrap a `LocalIndexTracker` using VSCode settings. */
export async function bootstrapFromConfig(): Promise<VFSResult<BootstrapResult>> {
  const config = readConfig();
  return bootstrapTracker({ cliPath: config.cliPath, timeoutMs: config.timeoutMs });
}
