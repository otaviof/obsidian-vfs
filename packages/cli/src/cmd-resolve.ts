import path from "node:path";

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

/** Strip [[brackets]] and |alias from wikilink input. */
function normalizeWikilink(input: string): string {
  let cleaned = input.trim();
  if (cleaned.startsWith("[[") && cleaned.endsWith("]]")) {
    cleaned = cleaned.slice(2, -2);
  }
  const pipeIndex = cleaned.indexOf("|");
  if (pipeIndex !== -1) {
    cleaned = cleaned.slice(0, pipeIndex);
  }
  return cleaned.trim();
}

/** Execute the resolve command. */
export async function run(args: ResolveArgs): Promise<number> {
  const wikilink = normalizeWikilink(args.wikilink);
  if (wikilink.length === 0) {
    writeStderr(formatUsageError("Empty wikilink after stripping brackets."));
    return EXIT_USAGE;
  }

  const boot = await bootstrapTracker({ cliPath: args.cliPath, timeoutMs: args.timeoutMs });
  if (!boot.ok) {
    if (args.json) {
      writeStdout(formatResolveJSON({ ok: false, error: boot.error }));
    } else {
      writeStderr(formatError(boot.error));
    }
    return EXIT_ERROR;
  }

  const resStart = performance.now();
  const result = await boot.value.tracker.resolveWikilink(wikilink);
  const resolutionMs = performance.now() - resStart;

  if (!result.ok) {
    if (args.json) {
      writeStdout(formatResolveJSON({ ok: false, error: result.error }));
    } else {
      writeStderr(formatError(result.error));
    }
    return EXIT_ERROR;
  }

  const { resolvedPath, candidates } = result.value;
  const physicalPath = path.join(boot.value.tracker.context.physicalPath, resolvedPath);
  const output: ResolveOutput = { wikilink, resolvedPath, physicalPath, candidates };

  if (args.json) {
    writeStdout(formatResolveJSON({ ok: true, data: output }));
  } else {
    writeStdout(formatResolveResult(output));
    if (candidates.length > 1) {
      writeStderr(formatResolveCandidates(wikilink, resolvedPath, candidates));
    }
  }

  if (args.verbose) {
    writeStderr(formatVerboseTiming("Resolution", resolutionMs));
    writeStderr(formatVerboseTiming("Init", boot.value.initMs));
  }

  return EXIT_SUCCESS;
}
