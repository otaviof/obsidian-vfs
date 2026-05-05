import * as vscode from "vscode";
import { DEFAULT_CLI_PATH, DEFAULT_TIMEOUT_MS, bootstrapTracker } from "@obsidian-vfs/core";
import type { BootstrapResult, VFSResult } from "@obsidian-vfs/core";

import type { ExtensionConfig } from "./types.js";

/** Read extension configuration from VSCode settings. */
export function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration("obsidianVFS");
  return {
    cliPath: cfg.get<string>("cliPath", DEFAULT_CLI_PATH),
    timeoutMs: cfg.get<number>("timeoutMs", DEFAULT_TIMEOUT_MS),
  };
}

/** Bootstrap a `LocalIndexTracker` using VSCode settings. */
export async function bootstrapFromConfig(): Promise<VFSResult<BootstrapResult>> {
  const config = readConfig();
  return bootstrapTracker(config);
}
