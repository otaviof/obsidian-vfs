import * as vscode from "vscode";
import { VAULT_MODE } from "@obsidian-vfs/core";
import type { LocalIndexTracker, VaultMode } from "@obsidian-vfs/core";

import { COMMAND } from "./types.js";

/** Manages a status bar item showing vault name and mode. */
export class StatusBarManager implements vscode.Disposable {
  readonly #item: vscode.StatusBarItem;
  readonly #vaultName: string;
  readonly #cliMode: string;
  #vaultMode: VaultMode = VAULT_MODE.RW;

  constructor(tracker: LocalIndexTracker) {
    this.#item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.#vaultName = tracker.context.name;
    this.#cliMode = tracker.context.mode;
    this.#updateText();
    this.#item.tooltip = "Obsidian VFS — click to mount a folder";
    this.#item.command = COMMAND.mount;
  }

  setVaultMode(mode: VaultMode): void {
    this.#vaultMode = mode;
    this.#updateText();
  }

  #updateText(): void {
    const icon = this.#vaultMode === VAULT_MODE.RW ? "$(book)" : "$(lock)";
    const suffix = this.#vaultMode === VAULT_MODE.RW ? "" : `, ${this.#vaultMode}`;
    this.#item.text = `${icon} ${this.#vaultName} (${this.#cliMode}${suffix})`;
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
