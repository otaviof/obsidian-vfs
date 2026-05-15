import * as vscode from "vscode";
import { DEFAULT_TIMEOUT_MS, bootstrapTracker, resolveCliPath } from "@obsidian-vfs/core";
import type { BootstrapResult, VFSResult } from "@obsidian-vfs/core";

import { CONFIG_SECTION } from "./types.js";
import type { ExtensionConfig } from "./types.js";

/** Read extension configuration from VSCode settings. */
export function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    cliPath: resolveCliPath({ userPath: cfg.get<string>("cliPath", "") }),
    timeoutMs: cfg.get<number>("timeoutMs", DEFAULT_TIMEOUT_MS),
    autoMount: cfg.get<string[]>("autoMount", []),
    explorer: cfg.get<boolean>("explorer", true),
    statusBar: cfg.get<boolean>("statusBar", true),
    workspace: cfg.get<boolean>("workspace", true),
  };
}

/** Bootstrap a `LocalIndexTracker` using VSCode settings. */
export async function bootstrapFromConfig(): Promise<VFSResult<BootstrapResult>> {
  const config = readConfig();
  return bootstrapTracker({ cliPath: config.cliPath, timeoutMs: config.timeoutMs });
}
