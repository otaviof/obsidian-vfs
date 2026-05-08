import { resolveCliPath } from "@obsidian-vfs/core";
import type { DiscoveredResource, LocalIndexTracker, VFSResult } from "@obsidian-vfs/core";

import type { ListResourcesArgs, ListResourcesOutput } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";
import { bootstrapTracker } from "./bootstrap.js";
import {
  formatError,
  formatListResourcesJSON,
  formatListResourcesResult,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";

/** Execute a list-resources command for the given resource kind. */
export async function run(
  args: ListResourcesArgs,
  resourceKind: string,
  enumerate: (tracker: LocalIndexTracker) => Promise<VFSResult<DiscoveredResource[]>>,
): Promise<number> {
  const boot = await bootstrapTracker({ cliPath: resolveCliPath(), timeoutMs: args.timeoutMs });
  if (!boot.ok) {
    if (args.json) {
      writeStdout(JSON.stringify({ ok: false, error: boot.error }, null, 2));
    } else {
      writeStderr(formatError(boot.error));
    }
    return EXIT_ERROR;
  }

  const { tracker, initMs } = boot.value;
  const enumStart = performance.now();

  const result = await enumerate(tracker);
  if (!result.ok) {
    if (args.json) {
      writeStdout(JSON.stringify({ ok: false, error: result.error }, null, 2));
    } else {
      writeStderr(formatError(result.error));
    }
    return EXIT_ERROR;
  }

  const enumMs = performance.now() - enumStart;

  const output: ListResourcesOutput = {
    resources: result.value,
    count: result.value.length,
  };

  if (args.json) {
    writeStdout(formatListResourcesJSON(output));
  } else {
    writeStdout(formatListResourcesResult(output, resourceKind));
  }

  if (args.verbose) {
    writeStderr(formatVerboseTiming("Enumeration", enumMs));
    writeStderr(formatVerboseTiming("Init", initMs));
  }

  return EXIT_SUCCESS;
}
