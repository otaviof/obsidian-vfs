import * as vscode from "vscode";

import { bootstrapFromConfig } from "./bootstrap.js";
import { ObsidianFileSystemProvider } from "./file-system-provider.js";

/** Extension output channel for diagnostics. */
let outputChannel: vscode.OutputChannel;

/** Activate the Obsidian VFS extension. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("Obsidian VFS");
  context.subscriptions.push(outputChannel);

  const result = await bootstrapFromConfig();
  if (!result.ok) {
    outputChannel.appendLine(`Obsidian VFS: bootstrap failed — ${result.error.message}`);
    outputChannel.appendLine("Extension active but provider unavailable.");
    return;
  }

  outputChannel.appendLine(
    `Obsidian VFS: vault "${result.value.tracker.context.name}" loaded in ${result.value.initMs.toFixed(0)}ms`,
  );

  const provider = new ObsidianFileSystemProvider(result.value.tracker);
  context.subscriptions.push(provider);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("obs", provider, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );

  const watcher = provider.watch(vscode.Uri.from({ scheme: "obs", path: "/" }));
  context.subscriptions.push(watcher);
}

/** Deactivate the Obsidian VFS extension. */
export function deactivate(): void {
  // Cleanup handled by disposables in context.subscriptions
}
