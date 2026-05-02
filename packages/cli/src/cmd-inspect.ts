import path from "node:path";

import type { InspectArgs, InspectOutput } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";
import { bootstrapTracker } from "./bootstrap.js";
import {
  formatError,
  formatInspectJSON,
  formatInspectResult,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";

/** Add the @obs: prefix if the user omitted it. */
function normalizeMention(input: string): string {
  if (input.startsWith("@obs:")) {
    return input;
  }
  return "@obs:" + input;
}

/** Execute the inspect command. */
export async function run(args: InspectArgs): Promise<number> {
  const mention = normalizeMention(args.mention);

  const boot = await bootstrapTracker({ cliPath: args.cliPath, timeoutMs: args.timeoutMs });
  if (!boot.ok) {
    if (args.json) {
      writeStdout(formatInspectJSON({ ok: false, error: boot.error }));
    } else {
      writeStderr(formatError(boot.error));
    }
    return EXIT_ERROR;
  }

  const resStart = performance.now();
  const result = await boot.value.tracker.resolveMention(mention);
  const resolutionMs = performance.now() - resStart;

  if (!result.ok) {
    if (args.json) {
      writeStdout(formatInspectJSON({ ok: false, error: result.error }));
    } else {
      writeStderr(formatError(result.error));
    }
    return EXIT_ERROR;
  }

  const physicalPath = path.join(boot.value.tracker.context.physicalPath, result.value.resolvedPath);
  const output: InspectOutput = {
    mention,
    targetType: result.value.targetType,
    resolvedPath: result.value.resolvedPath,
    physicalPath,
    vaultName: result.value.vaultName,
    section: result.value.section,
    contentLength: result.value.content.length,
    content: result.value.content,
  };

  if (args.json) {
    writeStdout(formatInspectJSON({ ok: true, data: output }));
  } else {
    writeStdout(formatInspectResult(output, { full: args.full }));
  }

  if (args.verbose) {
    writeStderr(formatVerboseTiming("Resolution", resolutionMs));
    writeStderr(formatVerboseTiming("Init", boot.value.initMs));
  }

  return EXIT_SUCCESS;
}
