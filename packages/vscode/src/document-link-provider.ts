import path from "node:path";

import * as vscode from "vscode";
import { parseMarkdownLinks, parseObsLinks, parseObsUri } from "@obsidian-vfs/core";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { toFileUri } from "./uri-adapter.js";

/** Provides clickable links for `[[wikilink]]` syntax and `[text](obs://...)` standard markdown links in documents. */
export class ObsidianDocumentLinkProvider implements vscode.DocumentLinkProvider {
  readonly #tracker: LocalIndexTracker;

  constructor(tracker: LocalIndexTracker) {
    this.#tracker = tracker;
  }

  async provideDocumentLinks(document: vscode.TextDocument): Promise<vscode.DocumentLink[]> {
    const text = document.getText();
    const links: vscode.DocumentLink[] = [];

    const wikilinks = parseMarkdownLinks(text).filter((l) => l.kind === "wikilink");
    for (const link of wikilinks) {
      const result = await this.#tracker.resolveWikilink(link.target);
      if (!result.ok) continue;

      const startPos = document.positionAt(link.startIndex);
      const endPos = document.positionAt(link.endIndex);
      const range = new vscode.Range(startPos, endPos);
      const targetUri = toFileUri(result.value.resolvedPath, this.#tracker.context.physicalPath);

      links.push(new vscode.DocumentLink(range, targetUri));
    }

    const obsLinks = parseObsLinks(text);
    for (const link of obsLinks) {
      const parsed = parseObsUri(link.rawUri);
      if (!parsed.ok) continue;

      if (parsed.value.vaultName.toLowerCase() !== this.#tracker.context.name.toLowerCase()) {
        continue;
      }

      let vaultPath = parsed.value.path;
      if (!path.extname(vaultPath)) {
        vaultPath += ".md";
      }

      const startPos = document.positionAt(link.startIndex);
      const endPos = document.positionAt(link.endIndex);
      const range = new vscode.Range(startPos, endPos);
      const targetUri = toFileUri(vaultPath, this.#tracker.context.physicalPath);

      links.push(new vscode.DocumentLink(range, targetUri));
    }

    return links;
  }
}
