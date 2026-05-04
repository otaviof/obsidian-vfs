/** Exit code for successful command execution. */
export const EXIT_SUCCESS = 0;

/** Exit code for runtime errors (vault not found, file not found, etc.). */
export const EXIT_ERROR = 1;

/** Exit code for usage errors (unknown command, missing argument, etc.). */
export const EXIT_USAGE = 2;

/** Global options parsed from process.argv. */
export interface CLIOptions {
  readonly command: "inspect" | "resolve" | "provision-skills" | "help";
  readonly json: boolean;
  readonly verbose: boolean;
  readonly full: boolean;
  readonly body: boolean;
  readonly dryRun: boolean;
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

/** Arguments for the provision-skills command. */
export interface ProvisionSkillsArgs {
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly verbose: boolean;
  readonly cliPath: string;
  readonly timeoutMs: number;
}

/** Structured output of the provision-skills command. */
export interface ProvisionSkillsOutput {
  readonly written: readonly string[];
  readonly permissionsAdded: number;
  readonly dryRun: boolean;
  readonly errors: readonly string[];
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
