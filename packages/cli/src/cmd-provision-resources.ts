import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

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

const require = createRequire(import.meta.url);

/** CLI package version, read from package.json at runtime. */
export const CLI_VERSION: string = (require("../package.json") as { version: string }).version;

/** Env var pointing to a local obsidian-vfs project directory. */
const PROJECT_DIR_ENV = "OBSIDIAN_VFS_PROJECT_DIR";

/** Build the read command prefix for !command directives and permission rules. */
export function readCommand(version: string): string {
  const projectDir = process.env[PROJECT_DIR_ENV];
  if (projectDir) {
    return `${projectDir}/bin/obs-read`;
  }
  return `npx @obsidian-vfs/cli@${version} inspect --body`;
}

/** Build a single generic permission rule covering all obs-read invocations. */
export function buildPermissionRule(version: string): string {
  return `Bash(${readCommand(version)} *)`;
}

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
  syncPermissions(settingsPath: string): Promise<{ added: number }>;
  /** Count how many permission rules would be added (read-only, for dry-run). */
  countPermissions(settingsPath: string): Promise<{ added: number }>;
  /** Output directory relative to project root (e.g. `.claude/skills`). */
  readonly outputDir: string;
}

/** Base directory for Claude Code configuration relative to project root. */
export const CLAUDE_DIR = ".claude";

/** Settings file path relative to project root. */
const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.local.json");

/** Ensure the generic permission rule exists in settings. Returns how many were added (0 or 1). */
export async function syncPermissionRule(
  settingsPath: string,
  version: string,
): Promise<{ added: number }> {
  let data: { permissions?: { allow?: string[] } };

  try {
    const raw = await readFile(settingsPath, "utf-8");
    data = JSON.parse(raw) as typeof data;
  } catch {
    data = {};
  }

  data.permissions ??= {};
  if (!Array.isArray(data.permissions.allow)) data.permissions.allow = [];

  const rule = buildPermissionRule(version);
  if (data.permissions.allow.includes(rule)) {
    return { added: 0 };
  }

  data.permissions.allow.push(rule);
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return { added: 1 };
}

/** Check whether the permission rule would be added (read-only, for dry-run). */
export async function countPermissionRule(
  settingsPath: string,
  version: string,
): Promise<{ added: number }> {
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const data = JSON.parse(raw) as { permissions?: { allow?: string[] } };
    const allow = Array.isArray(data.permissions?.allow) ? data.permissions.allow : [];
    return { added: allow.includes(buildPermissionRule(version)) ? 0 : 1 };
  } catch {
    return { added: 1 };
  }
}

/** Execute a provision command using the given strategy. */
export async function run(args: ProvisionArgs, strategy: ProvisionStrategy): Promise<number> {
  const boot = await bootstrapTracker();
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
      const result = await strategy.syncPermissions(settingsPath);
      permissionsAdded = result.added;
    } catch (err) {
      errors.push(`Failed to sync permissions: ${(err as Error).message}`);
    }
  } else {
    try {
      const result = await strategy.countPermissions(settingsPath);
      permissionsAdded = result.added;
    } catch {
      permissionsAdded = 1;
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
