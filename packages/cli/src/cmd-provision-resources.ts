import path from "node:path";

import { resolveCliPath } from "@obsidian-vfs/core";
import type { DiscoveredResource, LocalIndexTracker, VFSResult } from "@obsidian-vfs/core";

import type { ProvisionArgs, ProvisionFilter, ProvisionOutput } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";
import { bootstrapTracker } from "./bootstrap.js";
import { filterSkills } from "./filter-skills.js";
import {
  formatError,
  formatProvisionJSON,
  formatProvisionResult,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";

/** Strategy callbacks that vary between resource kinds (skills vs agents). */
export interface ProvisionStrategy {
  /** Human-readable resource kind for output formatting. */
  readonly resourceKind: string;
  /** Enumerate discovered resources from the tracker. */
  enumerate(tracker: LocalIndexTracker): Promise<VFSResult<DiscoveredResource[]>>;
  /** Write a single proxy file. Throw on failure. */
  writeProxy(
    resource: DiscoveredResource,
    tracker: LocalIndexTracker,
    outputDir: string,
  ): Promise<"written" | "unchanged">;
  /** Sync permission rules and return how many were added. */
  syncPermissions(settingsPath: string, matched: readonly string[]): Promise<{ added: number }>;
  /** Count how many permission rules would be added (read-only, for dry-run). */
  countPermissions(settingsPath: string, matched: readonly string[]): Promise<{ added: number }>;
  /** Output directory relative to project root (e.g. `.claude/skills`). */
  readonly outputDir: string;
}

/** Base directory for Claude Code configuration relative to project root. */
export const CLAUDE_DIR = ".claude";

/** Settings file path relative to project root. */
const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.local.json");

/** Execute a provision command using the given strategy. */
export async function run(args: ProvisionArgs, strategy: ProvisionStrategy): Promise<number> {
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

  const enumResult = await strategy.enumerate(tracker);
  if (!enumResult.ok) {
    if (args.json) {
      writeStdout(JSON.stringify({ ok: false, error: enumResult.error }, null, 2));
    } else {
      writeStderr(formatError(enumResult.error));
    }
    return EXIT_ERROR;
  }

  const enumMs = performance.now() - enumStart;
  const discovered = enumResult.value;

  const { matched, skipped } = filterSkills(discovered, {
    include: args.include,
    exclude: args.exclude,
  });

  const filter: ProvisionFilter = {
    include: args.include,
    exclude: args.exclude,
    discoveredCount: discovered.length,
    filteredCount: matched.length,
  };

  const cwd = process.cwd();
  const outputDir = path.join(cwd, strategy.outputDir);
  const settingsPath = path.join(cwd, SETTINGS_PATH);

  const written: string[] = [];
  const errors: string[] = [];

  if (!args.dryRun) {
    for (const resource of matched) {
      try {
        const status = await strategy.writeProxy(resource, tracker, outputDir);
        if (status === "written") written.push(resource.name);
      } catch (err) {
        errors.push(`Failed to write proxy for ${resource.name}: ${(err as Error).message}`);
      }
    }
  } else {
    for (const resource of matched) {
      written.push(resource.name);
    }
  }

  let permissionsAdded = 0;

  if (!args.dryRun) {
    try {
      const result = await strategy.syncPermissions(
        settingsPath,
        matched.map((r) => r.name),
      );
      permissionsAdded = result.added;
    } catch (err) {
      errors.push(`Failed to sync permissions: ${(err as Error).message}`);
    }
  } else {
    try {
      const result = await strategy.countPermissions(
        settingsPath,
        matched.map((r) => r.name),
      );
      permissionsAdded = result.added;
    } catch {
      permissionsAdded = matched.length;
    }
  }

  const output: ProvisionOutput = {
    written,
    skipped,
    permissionsAdded,
    dryRun: args.dryRun,
    errors,
    filter,
  };

  if (args.json) {
    writeStdout(formatProvisionJSON(output));
  } else {
    writeStdout(formatProvisionResult(output, strategy.resourceKind));
  }

  if (args.verbose) {
    writeStderr(formatVerboseTiming("Enumeration", enumMs));
    writeStderr(formatVerboseTiming("Init", initMs));
  }

  return errors.length > 0 ? EXIT_ERROR : EXIT_SUCCESS;
}
