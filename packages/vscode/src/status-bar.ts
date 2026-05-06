import * as vscode from "vscode";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

/** Manages a status bar item showing vault name and mode. */
export class StatusBarManager implements vscode.Disposable {
  readonly #item: vscode.StatusBarItem;

  constructor(tracker: LocalIndexTracker) {
    this.#item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.#item.text = `$(book) ${tracker.context.name} (${tracker.context.mode})`;
    this.#item.tooltip = "Obsidian VFS — click to mount a folder";
    this.#item.command = "obsidianVFS.mount";
  }

  /** Show the status bar item. */
  show(): void {
    this.#item.show();
  }

  /** Hide the status bar item. */
  hide(): void {
    this.#item.hide();
  }

  dispose(): void {
    this.#item.dispose();
  }
}
