import * as vscode from "vscode";

import type { ExtensionConfig } from "./types.js";
import { toVaultPath, toVscodeUri } from "./uri-adapter.js";

/** Mount vault folders listed in `obsidianVFS.autoMount` at activation time. */
export function autoMountFromConfig(config: ExtensionConfig, vaultName: string): void {
  if (config.autoMount.length === 0) return;

  const existing = vscode.workspace.workspaceFolders ?? [];
  const mountedPaths = new Set(
    existing.filter((wf) => wf.uri.scheme === "obs").map((wf) => toVaultPath(wf.uri)),
  );

  const newEntries: { uri: vscode.Uri; name: string }[] = [];
  for (const entry of config.autoMount) {
    if (mountedPaths.has(entry)) continue;
    const label = entry === "" ? `Obsidian: ${vaultName}` : `Obsidian: ${entry}`;
    newEntries.push({ uri: toVscodeUri(entry, vaultName), name: label });
  }

  if (newEntries.length > 0) {
    vscode.workspace.updateWorkspaceFolders(existing.length, 0, ...newEntries);
  }
}
