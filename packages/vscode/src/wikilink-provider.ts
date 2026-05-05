import * as vscode from "vscode";
import { parseMarkdownLinks } from "@obsidian-vfs/core";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { toVscodeUri } from "./uri-adapter.js";

/** Provides clickable links for `[[wikilink]]` syntax in Markdown files. */
export class WikilinkDocumentLinkProvider implements vscode.DocumentLinkProvider {
  readonly #tracker: LocalIndexTracker;

  constructor(tracker: LocalIndexTracker) {
    this.#tracker = tracker;
  }

  async provideDocumentLinks(document: vscode.TextDocument): Promise<vscode.DocumentLink[]> {
    const text = document.getText();
    const parsed = parseMarkdownLinks(text).filter((l) => l.kind === "wikilink");
    const links: vscode.DocumentLink[] = [];

    for (const link of parsed) {
      const result = await this.#tracker.resolveWikilink(link.target);
      if (!result.ok) continue;

      const startPos = document.positionAt(link.startIndex);
      const endPos = document.positionAt(link.endIndex);
      const range = new vscode.Range(startPos, endPos);
      const targetUri = toVscodeUri(result.value.resolvedPath, this.#tracker.context.name);

      links.push(new vscode.DocumentLink(range, targetUri));
    }

    return links;
  }
}
