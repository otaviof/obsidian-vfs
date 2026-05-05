import * as vscode from "vscode";
import type { LocalIndexTracker, VFSFileType } from "@obsidian-vfs/core";

import { toVscodeUri } from "./uri-adapter.js";

/** Context value for tree items, used in `when` clauses for context menus. */
type VaultItemContext = "obsFile" | "obsFolder";

/** A single node in the vault tree (file or folder). */
export class VaultTreeItem extends vscode.TreeItem {
  /** Vault-relative path of this item. */
  readonly vaultPath: string;

  constructor(label: string, vaultPath: string, type: VFSFileType, vaultName: string) {
    const isDir = type === "directory";
    super(
      label,
      isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );

    this.vaultPath = vaultPath;
    this.contextValue = (isDir ? "obsFolder" : "obsFile") satisfies VaultItemContext;
    this.resourceUri = toVscodeUri(vaultPath, vaultName);

    if (!isDir) {
      this.command = {
        command: "vscode.open",
        title: "Open",
        arguments: [this.resourceUri],
      };
    }
  }
}

/** `TreeDataProvider` surfacing vault folders from `obsidianVFS.autoMount` config. */
export class VaultTreeDataProvider
  implements vscode.TreeDataProvider<VaultTreeItem>, vscode.Disposable
{
  readonly #tracker: LocalIndexTracker;
  readonly #onDidChangeTreeData = new vscode.EventEmitter<VaultTreeItem | undefined>();
  readonly onDidChangeTreeData = this.#onDidChangeTreeData.event;
  readonly #watcherDisposable: vscode.Disposable;

  constructor(tracker: LocalIndexTracker) {
    this.#tracker = tracker;
    this.#watcherDisposable = tracker.onDidChangeFile(() => this.refresh());
  }

  /** Fire a tree data change to refresh all nodes. */
  refresh(): void {
    this.#onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: VaultTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: VaultTreeItem): Promise<VaultTreeItem[]> {
    if (element) {
      return this.#readChildren(element.vaultPath);
    }
    return this.#getRootChildren();
  }

  /** Read configured `autoMount` folders as root tree nodes. */
  async #getRootChildren(): Promise<VaultTreeItem[]> {
    const mounted = readAutoMount();
    if (mounted.length === 0) {
      return this.#readChildren("");
    }

    const vaultName = this.#tracker.context.name;
    return mounted.map(
      (folder) => new VaultTreeItem(folder || vaultName, folder, "directory", vaultName),
    );
  }

  /** List directory contents as tree items. */
  async #readChildren(vaultPath: string): Promise<VaultTreeItem[]> {
    const result = await this.#tracker.readDirectory(vaultPath);
    if (!result.ok) return [];

    const vaultName = this.#tracker.context.name;
    return result.value
      .slice()
      .sort(sortEntries)
      .map(
        ([name, type]) =>
          new VaultTreeItem(name, vaultPath ? `${vaultPath}/${name}` : name, type, vaultName),
      );
  }

  dispose(): void {
    this.#onDidChangeTreeData.dispose();
    this.#watcherDisposable.dispose();
  }
}

/** Read `obsidianVFS.autoMount` from workspace-scoped settings. */
export function readAutoMount(): string[] {
  return vscode.workspace.getConfiguration("obsidianVFS").get<string[]>("autoMount", []);
}

/** Sort directory entries: folders first, then alphabetical. */
function sortEntries(a: readonly [string, VFSFileType], b: readonly [string, VFSFileType]): number {
  if (a[1] !== b[1]) return a[1] === "directory" ? -1 : 1;
  return a[0].localeCompare(b[0]);
}
