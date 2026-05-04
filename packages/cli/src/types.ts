import type { DiscoveredResource } from "@obsidian-vfs/core";

/** Exit code for successful command execution. */
export const EXIT_SUCCESS = 0;

/** Exit code for runtime errors (vault not found, file not found, etc.). */
export const EXIT_ERROR = 1;

/** Exit code for usage errors (unknown command, missing argument, etc.). */
export const EXIT_USAGE = 2;

/** Global options parsed from process.argv. */
export interface CLIOptions {
  readonly command:
    | "inspect"
    | "resolve"
    | "provision-skills"
    | "list-skills"
    | "provision-agents"
    | "list-agents"
    | "help";
  readonly json: boolean;
  readonly verbose: boolean;
  readonly full: boolean;
  readonly body: boolean;
  readonly dryRun: boolean;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly cliPath: string;
  readonly timeoutMs: number;
}

/** Arguments for the inspect command. */
export interface InspectArgs {
  readonly mention: string;
  readonly json: boolean;
  readonly verbose: boolean;
  readonly full: boolean;
  readonly body: boolean;
  readonly cliPath: string;
  readonly timeoutMs: number;
}

/** Arguments for listing resources (skills or agents). */
export interface ListResourcesArgs {
  readonly json: boolean;
  readonly verbose: boolean;
  readonly cliPath: string;
  readonly timeoutMs: number;
}

/** Structured output of a list-resources command (skills or agents). */
export interface ListResourcesOutput {
  readonly resources: readonly DiscoveredResource[];
  readonly count: number;
}

/** Arguments for provisioning resources (skills or agents). */
export interface ProvisionArgs {
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly verbose: boolean;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly cliPath: string;
  readonly timeoutMs: number;
}

/** Metadata about filtering applied during provisioning. */
export interface ProvisionFilter {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly discoveredCount: number;
  readonly filteredCount: number;
}

/** Structured output of a provision command (skills or agents). */
export interface ProvisionOutput {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  readonly permissionsAdded: number;
  readonly dryRun: boolean;
  readonly errors: readonly string[];
  readonly filter: ProvisionFilter;
}

/** Arguments for the resolve command. */
export interface ResolveArgs {
  readonly wikilink: string;
  readonly json: boolean;
  readonly verbose: boolean;
  readonly cliPath: string;

  readonly timeoutMs: number;
}

/** Structured output of the inspect command (used for --json). */
export interface InspectOutput {
  readonly mention: string;
  readonly targetType: "file" | "agent" | "skill";
  readonly resolvedPath: string;
  readonly physicalPath: string;
  readonly vaultName: string;
  readonly section: string | undefined;
  readonly contentLength: number;
  readonly content: string;
}

/** Structured output of the resolve command (used for --json). */
export interface ResolveOutput {
  readonly wikilink: string;
  readonly resolvedPath: string;
  readonly physicalPath: string;
  readonly candidates: readonly string[];
}
