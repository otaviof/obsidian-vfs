#!/usr/bin/env node

import { parseArgs } from "node:util";

import { DEFAULT_TIMEOUT_MS } from "@obsidian-vfs/core";

import type {
  CLIOptions,
  InspectArgs,
  ListResourcesArgs,
  ProvisionArgs,
  ResolveArgs,
} from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS, EXIT_USAGE } from "./types.js";
import { run as runInspect } from "./cmd-inspect.js";
import { run as runListSkills } from "./cmd-list-skills.js";
import { run as runListAgents } from "./cmd-list-agents.js";
import { run as runProvisionSkills } from "./cmd-provision-skills.js";
import { run as runProvisionAgents } from "./cmd-provision-agents.js";
import { run as runResolve } from "./cmd-resolve.js";
import { formatHelp, formatUsageError, writeStderr, writeStdout } from "./formatters.js";

/** Valid command names for dispatch. */
const VALID_COMMANDS = new Set([
  "inspect",
  "resolve",
  "provision-skills",
  "list-skills",
  "provision-agents",
  "list-agents",
  "help",
]);

/** Parse process.argv into structured CLI options. */
export function parseGlobalArgs(
  argv: readonly string[],
):
  | { ok: true; options: CLIOptions; positionals: readonly string[] }
  | { ok: false; exitCode: number } {
  let parsed: ReturnType<typeof parseArgs>;

  try {
    parsed = parseArgs({
      options: {
        json: { type: "boolean", default: false },
        verbose: { type: "boolean", short: "v", default: false },
        full: { type: "boolean", default: false },
        body: { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        include: { type: "string", multiple: true, default: [] as string[] },
        exclude: { type: "string", multiple: true, default: [] as string[] },
        timeout: { type: "string", default: String(DEFAULT_TIMEOUT_MS) },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
      args: argv as string[],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeStderr(formatUsageError(message));
    return { ok: false, exitCode: EXIT_USAGE };
  }

  if (parsed.values.help === true || parsed.positionals.length === 0) {
    return {
      ok: true,
      options: {
        command: "help",
        json: false,
        verbose: false,
        full: false,
        body: false,
        dryRun: false,
        include: [],
        exclude: [],
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      positionals: [],
    };
  }

  const command = parsed.positionals[0];
  if (!VALID_COMMANDS.has(command)) {
    writeStderr(formatUsageError(`Unknown command: ${command}`));
    return { ok: false, exitCode: EXIT_USAGE };
  }

  const timeoutStr = parsed.values.timeout as string;
  const timeoutMs = Number.parseInt(timeoutStr, 10);
  if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    writeStderr(formatUsageError(`Invalid timeout value: ${timeoutStr}`));
    return { ok: false, exitCode: EXIT_USAGE };
  }

  const include = parsed.values.include as string[];
  const exclude = parsed.values.exclude as string[];
  if (include.length > 0 && exclude.length > 0) {
    writeStderr(formatUsageError("--include and --exclude are mutually exclusive"));
    return { ok: false, exitCode: EXIT_USAGE };
  }

  return {
    ok: true,
    options: {
      command: command as CLIOptions["command"],
      json: parsed.values.json as boolean,
      verbose: parsed.values.verbose as boolean,
      full: parsed.values.full as boolean,
      body: parsed.values.body as boolean,
      dryRun: parsed.values["dry-run"] as boolean,
      include,
      exclude,
      timeoutMs,
    },
    positionals: parsed.positionals.slice(1),
  };
}

/** Build InspectArgs from parsed options and positionals. */
function buildInspectArgs(options: CLIOptions, positionals: readonly string[]): InspectArgs | null {
  if (positionals.length === 0) {
    writeStderr(formatUsageError("Missing required argument: <mention>"));
    return null;
  }
  return {
    mention: positionals[0],
    json: options.json,
    verbose: options.verbose,
    full: options.full,
    body: options.body,
    timeoutMs: options.timeoutMs,
  };
}

/** Build ResolveArgs from parsed options and positionals. */
function buildResolveArgs(options: CLIOptions, positionals: readonly string[]): ResolveArgs | null {
  if (positionals.length === 0) {
    writeStderr(formatUsageError("Missing required argument: <wikilink>"));
    return null;
  }
  return {
    wikilink: positionals[0],
    json: options.json,
    verbose: options.verbose,
    timeoutMs: options.timeoutMs,
  };
}

/** Build ListResourcesArgs from parsed options. */
function buildListResourcesArgs(options: CLIOptions): ListResourcesArgs {
  return {
    json: options.json,
    verbose: options.verbose,
    timeoutMs: options.timeoutMs,
  };
}

/** Build ProvisionArgs from parsed options. */
function buildProvisionArgs(options: CLIOptions): ProvisionArgs {
  return {
    dryRun: options.dryRun,
    json: options.json,
    verbose: options.verbose,
    include: options.include,
    exclude: options.exclude,
    timeoutMs: options.timeoutMs,
  };
}

/** Dispatch parsed options to the appropriate command handler. */
async function dispatch(options: CLIOptions, positionals: readonly string[]): Promise<number> {
  switch (options.command) {
    case "help":
      writeStdout(formatHelp());
      return EXIT_SUCCESS;

    case "inspect": {
      const args = buildInspectArgs(options, positionals);
      if (!args) return EXIT_USAGE;
      return runInspect(args);
    }

    case "resolve": {
      const args = buildResolveArgs(options, positionals);
      if (!args) return EXIT_USAGE;
      return runResolve(args);
    }

    case "list-skills":
      return runListSkills(buildListResourcesArgs(options));

    case "provision-skills":
      return runProvisionSkills(buildProvisionArgs(options));

    case "list-agents":
      return runListAgents(buildListResourcesArgs(options));

    case "provision-agents":
      return runProvisionAgents(buildProvisionArgs(options));
  }
}

/** CLI entry point. */
async function main(): Promise<void> {
  try {
    const result = parseGlobalArgs(process.argv.slice(2));
    if (!result.ok) {
      process.exit(result.exitCode);
    }

    const code = await dispatch(result.options, result.positionals);
    process.exit(code);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeStderr(`Internal error: ${message}`);
    process.exit(EXIT_ERROR);
  }
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntryPoint) {
  void main();
}
