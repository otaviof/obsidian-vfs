import {
  bootstrapTracker as coreBootstrapTracker,
  resolveCliPath,
  resolveExecConfig,
} from "@obsidian-vfs/core";
export type { BootstrapResult } from "@obsidian-vfs/core";

/** Bootstrap a tracker using environment-resolved config. */
export function bootstrapTracker() {
  const { timeoutMs } = resolveExecConfig(process.env);
  return coreBootstrapTracker({ cliPath: resolveCliPath(), timeoutMs });
}
