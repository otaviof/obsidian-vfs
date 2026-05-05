import * as vscode from "vscode";

import { autoMountFromConfig } from "./auto-mount.js";
import { bootstrapFromConfig, readConfig } from "./bootstrap.js";
import { registerCommands } from "./commands.js";
import { ObsidianFileSystemProvider } from "./file-system-provider.js";
import { StatusBarManager } from "./status-bar.js";
import { WikilinkDocumentLinkProvider } from "./wikilink-provider.js";

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

  const provider = new ObsidianFileSystemProvider(tracker);
  context.subscriptions.push(provider);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("obs", provider, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );

  const watcher = provider.watch(vscode.Uri.from({ scheme: "obs", path: "/" }));
  context.subscriptions.push(watcher);

  registerCommands(context, tracker, outputChannel);

  const config = readConfig();
  autoMountFromConfig(config, tracker.context.name);

  const statusBar = new StatusBarManager(tracker);
  context.subscriptions.push(statusBar);

  const wikilinkProvider = new WikilinkDocumentLinkProvider(tracker);
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { scheme: "obs", language: "markdown" },
      wikilinkProvider,
    ),
  );
}

/** Deactivate the Obsidian VFS extension. */
export function deactivate(): void {
  // Cleanup handled by disposables in context.subscriptions
}
