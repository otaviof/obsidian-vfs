import * as vscode from "vscode";

import { SCHEME } from "./uri-adapter.js";
import type { VaultTreeItem } from "./vault-tree-provider.js";

/** Accept file drops onto the sidebar tree view and copy them into the vault. */
export class VaultTreeDragAndDropController implements vscode.TreeDragAndDropController<VaultTreeItem> {
  readonly dropMimeTypes = ["files", "text/uri-list"] as const;
  readonly dragMimeTypes = [] as const;

  readonly #vaultName: string;

  constructor(vaultName: string) {
    this.#vaultName = vaultName;
  }

  async handleDrop(
    target: VaultTreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const uriList = dataTransfer.get("text/uri-list");
    if (!uriList) return;

    const uris = (await uriList.asString())
      .split(/\r?\n/)
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => vscode.Uri.parse(line.trim()));

    const targetFolder = this.#resolveTargetFolder(target);

    for (const sourceUri of uris) {
      const fileName = sourceUri.path.split("/").pop();
      if (!fileName) continue;

      const destPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
      const destUri = vscode.Uri.from({
        scheme: SCHEME,
        authority: this.#vaultName,
        path: `/${destPath}`,
      });

      try {
        await vscode.workspace.fs.copy(sourceUri, destUri, { overwrite: false });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Failed to copy ${fileName}: ${msg}`);
      }
    }
  }

  #resolveTargetFolder(target: VaultTreeItem | undefined): string {
    if (!target) return "";
    if (target.contextValue === "obsFolder") return target.vaultPath;
    const lastSlash = target.vaultPath.lastIndexOf("/");
    return lastSlash < 0 ? "" : target.vaultPath.substring(0, lastSlash);
  }
}
