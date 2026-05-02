import { LocalIndexTracker, ObsidianCLIImpl } from "@obsidian-vfs/core";
import type { VFSResult } from "@obsidian-vfs/core";

/** Execution options passed to the Obsidian CLI wrapper. */
export interface BootstrapOptions {
  readonly cliPath: string;
  readonly timeoutMs: number;
}

/** Successful bootstrap result with the tracker and timing info. */
export interface BootstrapSuccess {
  readonly tracker: LocalIndexTracker;
  readonly initMs: number;
}

/** Create a LocalIndexTracker instance from CLI options. */
export async function bootstrapTracker(
  options: BootstrapOptions,
): Promise<VFSResult<BootstrapSuccess>> {
  const start = performance.now();

  const cli = new ObsidianCLIImpl({
    cliPath: options.cliPath,
    timeoutMs: options.timeoutMs,
  });

  const result = await LocalIndexTracker.create(cli);
  if (!result.ok) {
    return result;
  }

  const initMs = performance.now() - start;
  return { ok: true, value: { tracker: result.value, initMs } };
}
