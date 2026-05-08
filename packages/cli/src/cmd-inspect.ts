import path from "node:path";

import {
  SKILL_PREFIX,
  normalizeMention,
  resolveCliPath,
  resolveSkillMention,
} from "@obsidian-vfs/core";
import type { VFSError } from "@obsidian-vfs/core";

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

/** Write an error result to the appropriate output stream. */
function emitError(error: VFSError, json: boolean): number {
  if (json) {
    writeStdout(formatInspectJSON({ ok: false, error }));
  } else {
    writeStderr(formatError(error));
  }
  return EXIT_ERROR;
}

/** Execute the inspect command. */
export async function run(args: InspectArgs): Promise<number> {
  const mention = normalizeMention(args.mention);

  const boot = await bootstrapTracker({ cliPath: resolveCliPath(), timeoutMs: args.timeoutMs });
  if (!boot.ok) return emitError(boot.error, args.json);

  const { tracker, initMs } = boot.value;
  const resStart = performance.now();

  const result = mention.startsWith(SKILL_PREFIX)
    ? await resolveSkillMention(mention, tracker)
    : await tracker.resolveMention(mention);
  const resolutionMs = performance.now() - resStart;

  if (!result.ok) return emitError(result.error, args.json);

  const physicalPath = path.join(tracker.context.physicalPath, result.value.resolvedPath);
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

  if (args.body) {
    writeStdout(output.content);
  } else if (args.json) {
    writeStdout(formatInspectJSON({ ok: true, data: output }));
  } else {
    writeStdout(formatInspectResult(output, { full: args.full }));
  }

  if (args.verbose) {
    writeStderr(formatVerboseTiming("Resolution", resolutionMs));
    writeStderr(formatVerboseTiming("Init", initMs));
  }

  return EXIT_SUCCESS;
}
