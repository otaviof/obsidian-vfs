import type { CLIExecOptions } from "./exec.js";
import type { VFSResult } from "./types.js";
import { LocalIndexTracker } from "./local-index-tracker.js";
import { ObsidianCLIImpl } from "./obsidian-cli.js";

/** Successful bootstrap result with the tracker and timing info. */
export interface BootstrapResult {
  readonly tracker: LocalIndexTracker;
  readonly initMs: number;
}

/** Create a LocalIndexTracker instance from CLI execution options. */
export async function bootstrapTracker(config: CLIExecOptions): Promise<VFSResult<BootstrapResult>> {
  const start = performance.now();

  const cli = new ObsidianCLIImpl({
    cliPath: config.cliPath,
    timeoutMs: config.timeoutMs,
  });

  const result = await LocalIndexTracker.create(cli);
  if (!result.ok) return result;

  const initMs = performance.now() - start;
  return { ok: true, value: { tracker: result.value, initMs } };
}
