import type { VFSError } from "@obsidian-vfs/core";

import type { InspectOutput, ResolveOutput } from "./types.js";

/** Maximum number of lines shown in inspect content preview. */
const INSPECT_MAX_LINES = 80;

/** Label width for aligned key-value output. */
const LABEL_WIDTH = 16;

/** Map error codes to human-readable prefixes. */
function errorPrefix(code: string): string {
  const map: Record<string, string> = {
    VAULT_NOT_FOUND: "Vault not found",
    FILE_NOT_FOUND: "File not found",
    PARSE_ERROR: "Parse error",
    CLI_ERROR: "CLI error",
    CLI_UNAVAILABLE: "CLI unavailable",
    TIMEOUT: "Timeout",
    PERMISSION_DENIED: "Permission denied",
    INVALID_URI: "Invalid reference",
    NOT_IMPLEMENTED: "Not implemented",
  };
  return map[code] ?? "Error";
}

/** Format a label-value pair with consistent padding. */
function labelLine(label: string, value: string): string {
  return `${(label + ":").padEnd(LABEL_WIDTH)}${value}`;
}

/** Truncate content to a maximum number of lines. */
function truncateContent(content: string, maxLines: number): { text: string; omitted: number } {
  const lines = content.split("\n");
  if (lines.length <= maxLines) {
    return { text: content, omitted: 0 };
  }
  return {
    text: lines.slice(0, maxLines).join("\n"),
    omitted: lines.length - maxLines,
  };
}

/** Write a string to stdout. */
export function writeStdout(text: string): void {
  process.stdout.write(text + "\n");
}

/** Write a string to stderr. */
export function writeStderr(text: string): void {
  process.stderr.write(text + "\n");
}

/** Map a VFSError to a user-friendly error message. */
export function formatError(error: VFSError): string {
  const prefix = errorPrefix(error.code);
  let msg = `Error: ${prefix}: ${error.message}`;

  if (error.code === "CLI_UNAVAILABLE") {
    msg += "\nHint: Is the Obsidian CLI installed? Check that 'obsidian' is on your PATH.";
  } else if (error.code === "VAULT_NOT_FOUND") {
    msg +=
      "\nHint: Run this command from within an Obsidian vault directory, or set the OBSIDIAN_VAULT environment variable.";
  }

  return msg;
}

/** Format the inspect result for terminal display. */
export function formatInspectResult(output: InspectOutput, options: { full: boolean }): string {
  const lines: string[] = [
    labelLine("Mention", output.mention),
    labelLine("Target Type", output.targetType),
    labelLine("Vault Path", output.resolvedPath),
    labelLine("Physical Path", output.physicalPath),
    labelLine("Vault", output.vaultName),
  ];

  if (output.section !== undefined) {
    lines.push(labelLine("Section", output.section));
  }

  lines.push("");
  lines.push(`--- Content (${output.contentLength.toLocaleString()} bytes) ---`);

  if (options.full) {
    lines.push(output.content);
  } else {
    const { text, omitted } = truncateContent(output.content, INSPECT_MAX_LINES);
    lines.push(text);
    if (omitted > 0) {
      lines.push(`[... ${omitted} more lines]`);
    }
  }

  return lines.join("\n");
}

/** Format the inspect result as JSON. */
export function formatInspectJSON(
  result: { ok: true; data: InspectOutput } | { ok: false; error: VFSError },
): string {
  return JSON.stringify(result, null, 2);
}

/** Format the resolve result for terminal display. */
export function formatResolveResult(output: ResolveOutput): string {
  return [
    labelLine("Wikilink", output.wikilink),
    labelLine("Vault Path", output.resolvedPath),
    labelLine("Physical Path", output.physicalPath),
  ].join("\n");
}

/** Format the resolve result as JSON. */
export function formatResolveJSON(
  result: { ok: true; data: ResolveOutput } | { ok: false; error: VFSError },
): string {
  return JSON.stringify(result, null, 2);
}

/** Format a timing measurement for verbose stderr output. */
export function formatVerboseTiming(label: string, ms: number): string {
  return `[verbose] ${label}: ${ms.toFixed(1)}ms`;
}

/** Format the help/usage text. */
export function formatHelp(): string {
  return `Usage: obsidian-vfs <command> [options]

Commands:
  inspect <mention>    Resolve an @obs: mention and show the result
  resolve <wikilink>   Resolve a [[wikilink]] to its vault path

Options:
  --json               Output as JSON
  -v, --verbose        Show timing and diagnostics
  --full               Show full content (inspect only, no truncation)
  --cli-path <path>    Path to Obsidian CLI binary (default: obsidian)
  --timeout <ms>       CLI timeout in milliseconds (default: 10000)
  -h, --help           Show this help message

Examples:
  obsidian-vfs inspect "@obs:architect"
  obsidian-vfs inspect "10-projects/plan.md#Architecture"
  obsidian-vfs resolve "Project Plan"
  obsidian-vfs resolve "[[Project Plan]]"`;
}

/** Format a usage error with the correct usage hint. */
export function formatUsageError(message: string): string {
  return `Error: ${message}\n\nRun 'obsidian-vfs --help' for usage.`;
}
