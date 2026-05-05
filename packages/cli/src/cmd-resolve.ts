import path from "node:path";

import { classifyInput, normalizeWikilink, SKILL_PREFIX } from "@obsidian-vfs/core";
import type { VFSError } from "@obsidian-vfs/core";

import type { ResolveArgs, ResolveOutput } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS, EXIT_USAGE } from "./types.js";
import { bootstrapTracker } from "./bootstrap.js";
import {
  formatError,
  formatResolveCandidates,
  formatResolveJSON,
  formatResolveResult,
  formatUsageError,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";

/** Write an error result to the appropriate output stream. */
function emitError(error: VFSError, json: boolean): number {
  if (json) {
    writeStdout(formatResolveJSON({ ok: false, error }));
  } else {
    writeStderr(formatError(error));
  }
  return EXIT_ERROR;
}

/** Format and write a successful resolve result. */
function emitSuccess(
  label: string,
  resolvedPath: string,
  physicalPath: string,
  candidates: readonly string[],
  args: ResolveArgs,
): void {
  const output: ResolveOutput = { wikilink: label, resolvedPath, physicalPath, candidates };
  if (args.json) {
    writeStdout(formatResolveJSON({ ok: true, data: output }));
  } else {
    writeStdout(formatResolveResult(output));
    if (candidates.length > 1) {
      writeStderr(formatResolveCandidates(label, resolvedPath, candidates));
    }
  }
}

/** Execute the resolve command. */
export async function run(args: ResolveArgs): Promise<number> {
  const raw = args.wikilink.trim();
  const kind = classifyInput(raw);
  const input = kind === "wikilink" ? normalizeWikilink(raw) : raw;

  if (input.length === 0) {
    writeStderr(formatUsageError("Empty reference after normalization."));
    return EXIT_USAGE;
  }

  const boot = await bootstrapTracker({ cliPath: args.cliPath, timeoutMs: args.timeoutMs });
  if (!boot.ok) return emitError(boot.error, args.json);

  const { tracker, initMs } = boot.value;
  const resStart = performance.now();

  if (kind === "mention") {
    const result = await tracker.resolveMention(input);
    const resolutionMs = performance.now() - resStart;

    if (!result.ok) return emitError(result.error, args.json);

    const physicalPath = path.join(tracker.context.physicalPath, result.value.resolvedPath);
    emitSuccess(input, result.value.resolvedPath, physicalPath, [], args);

    if (args.verbose) {
      writeStderr(formatVerboseTiming("Resolution", resolutionMs));
      writeStderr(formatVerboseTiming("Init", initMs));
    }

    return EXIT_SUCCESS;
  }

  if (kind === "skill") {
    const skillName = input.slice(SKILL_PREFIX.length);
    const result = await tracker.resolveSkill(skillName);
    const resolutionMs = performance.now() - resStart;

    if (!result.ok) return emitError(result.error, args.json);

    const physicalPath = path.join(tracker.context.physicalPath, result.value);
    emitSuccess(input, result.value, physicalPath, [], args);

    if (args.verbose) {
      writeStderr(formatVerboseTiming("Resolution", resolutionMs));
      writeStderr(formatVerboseTiming("Init", initMs));
    }

    return EXIT_SUCCESS;
  }

  const result = await tracker.resolveWikilink(input);
  const resolutionMs = performance.now() - resStart;

  if (!result.ok) return emitError(result.error, args.json);

  const { resolvedPath, candidates } = result.value;
  const physicalPath = path.join(tracker.context.physicalPath, resolvedPath);
  emitSuccess(input, resolvedPath, physicalPath, candidates, args);

  if (args.verbose) {
    writeStderr(formatVerboseTiming("Resolution", resolutionMs));
    writeStderr(formatVerboseTiming("Init", initMs));
  }

  return EXIT_SUCCESS;
}
