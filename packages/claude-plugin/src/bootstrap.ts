import { LocalIndexTracker, ObsidianCLIImpl } from "@obsidian-vfs/core";
import type { CLIExecOptions, VFSResult } from "@obsidian-vfs/core";

import type { BootstrapResult } from "./types.js";

/** Create a LocalIndexTracker instance from CLI execution options. */
export async function bootstrapTracker(config: CLIExecOptions): Promise<VFSResult<BootstrapResult>> {
  const cli = new ObsidianCLIImpl({
    cliPath: config.cliPath,
    timeoutMs: config.timeoutMs,
  });

  const result = await LocalIndexTracker.create(cli);
  if (!result.ok) return result;

  return { ok: true, value: { tracker: result.value } };
}
