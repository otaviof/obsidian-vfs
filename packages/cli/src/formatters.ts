import type { VFSError, DiscoveredResource } from "@obsidian-vfs/core";

import type { InspectOutput, ListResourcesOutput, ProvisionOutput, ResolveOutput } from "./types.js";

/** Maximum number of lines shown in inspect content preview. */
const INSPECT_MAX_LINES = 80;

/** Label width for aligned key-value output. */
const LABEL_WIDTH = 16;

/** Column definition for tabular CLI output. */
interface TableColumn {
  readonly label: string;
  readonly value: (item: DiscoveredResource) => string;
  readonly maxWidth?: number;
}

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

/** Format rows into padded, aligned columns. */
function formatTable(columns: readonly TableColumn[], rows: readonly DiscoveredResource[]): string {
  if (rows.length === 0) {
    return "";
  }

  const columnWidths = columns.map((col) => {
    const maxValueLength = Math.max(...rows.map((row) => col.value(row).length));
    return col.maxWidth !== undefined ? Math.min(maxValueLength, col.maxWidth) : maxValueLength;
  });

  const lines: string[] = [];
  for (const row of rows) {
    const cells = columns.map((col, i) => {
      const value = col.value(row);
      const width = columnWidths[i];
      if (value.length > width) {
        return value.slice(0, width - 1) + "…";
      }
      return value.padEnd(width);
    });
    lines.push("  " + cells.join("  "));
  }

  return lines.join("\n");
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
    msg +=
      "\nHint: Is the Obsidian CLI installed? Set the OBSIDIAN_VFS_CLI_PATH environment variable to override.";
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
    labelLine("Wikilink", `"${output.wikilink}"`),
    labelLine("Vault-Path", `"${output.resolvedPath}"`),
    labelLine("Physical-Path", `"${output.physicalPath}"`),
  ].join("\n");
}

/** Format the resolve result as JSON. */
export function formatResolveJSON(
  result: { ok: true; data: ResolveOutput } | { ok: false; error: VFSError },
): string {
  return JSON.stringify(result, null, 2);
}

/** Format the search candidates warning for terminal display. */
export function formatResolveCandidates(
  wikilink: string,
  resolvedPath: string,
  candidates: readonly string[],
): string {
  const lines: string[] = [
    "",
    `Warning: ${candidates.length} search results for "${wikilink}", resolved to shortest exact match.`,
    "Candidates:",
  ];
  for (const c of candidates) {
    const marker = c === resolvedPath ? "  <-- resolved" : "";
    lines.push(`  "${c}"${marker}`);
  }
  return lines.join("\n");
}

/** Format a timing measurement for verbose stderr output. */
export function formatVerboseTiming(label: string, ms: number): string {
  return `[verbose] ${label}: ${ms.toFixed(1)}ms`;
}

/** Format a list-resources result for terminal display. */
export function formatListResourcesResult(
  output: ListResourcesOutput,
  resourceKind: string,
  options: { description: boolean },
): string {
  if (output.count === 0) {
    return `Found 0 ${resourceKind}.`;
  }

  const columns: TableColumn[] = [
    { label: "Name", value: (r) => r.name },
    ...(options.description
      ? [{ label: "Description", value: (r: DiscoveredResource) => r.description, maxWidth: 50 }]
      : []),
    { label: "Path", value: (r) => r.vaultRelativePath },
  ];

  const header = `Found ${output.count} ${resourceKind}:`;
  const table = formatTable(columns, output.resources);
  return [header, "", table].join("\n");
}

/** Format a list-resources result as JSON. */
export function formatListResourcesJSON(output: ListResourcesOutput): string {
  return JSON.stringify(output, null, 2);
}

/** Format a provision result for terminal display. */
export function formatProvisionResult(output: ProvisionOutput, resourceKind: string): string {
  const prefix = output.dryRun ? "[dry-run] " : "";
  const lines: string[] = [
    `${prefix}Wrote ${output.written.length} ${resourceKind}:`,
    "",
    labelLine("written", output.written.join(", ") || "(none)"),
  ];

  if (output.skipped.length > 0) {
    lines.push(labelLine("skipped", output.skipped.join(", ")));
  }

  lines.push(
    labelLine("permissions", `added ${output.permissionsAdded} in .claude/settings.local.json`),
  );

  const hasFilter = output.filter.include.length > 0 || output.filter.exclude.length > 0;
  if (hasFilter) {
    const pattern =
      output.filter.include.length > 0
        ? `--include ${output.filter.include.map((p) => `"${p}"`).join(" ")}`
        : `--exclude ${output.filter.exclude.map((p) => `"${p}"`).join(" ")}`;
    lines.push(
      labelLine(
        "filter",
        `${pattern} (${output.filter.discoveredCount} discovered, ${output.filter.filteredCount} provisioned)`,
      ),
    );
  }

  if (output.errors.length > 0) {
    lines.push("");
    for (const err of output.errors) {
      lines.push(`  error: ${err}`);
    }
  }

  return lines.join("\n");
}

/** Format a provision result as JSON. */
export function formatProvisionJSON(output: ProvisionOutput): string {
  return JSON.stringify(output, null, 2);
}

/** Format the help/usage text. */
export function formatHelp(): string {
  return `Usage: obsidian-vfs <command> [options]

Commands:
  inspect <mention>       Resolve an @obs: mention and show the result
  resolve <wikilink>      Resolve a [[wikilink]] to its vault path
  list-skills             List all discovered vault skills
  provision-skills        Generate proxy SKILL.md files from vault skills
  list-agents             List all discovered vault agents
  provision-agents        Generate proxy agent files from vault agents

Options:
  --json                  Output as JSON
  -v, --verbose           Show timing and diagnostics
  --full                  Show full content (inspect only, no truncation)
  --body                  Output only the content body (inspect only)
  --description           Show descriptions (list-skills, list-agents)
  --dry-run               Show what would change without writing (provision-*)
  --include <glob>        Only provision resources matching glob (repeatable, provision-*)
  --exclude <glob>        Skip resources matching glob (repeatable, provision-*)
  -h, --help              Show this help message

Environment:
  OBSIDIAN_VFS_CLI_PATH        Path to the Obsidian CLI binary (default: "obsidian")
  OBSIDIAN_VFS_TIMEOUT_MS      CLI operation timeout in ms (default: 10000)
  OBSIDIAN_VFS_PROJECT_DIR     Local project dir — provisioning emits ./bin/obs-read instead of npx

Examples:
  obsidian-vfs inspect "@obs:architect"
  obsidian-vfs inspect "/obs:deploy" --body
  obsidian-vfs inspect "10-projects/plan.md#Architecture"
  obsidian-vfs resolve "Project Plan"
  obsidian-vfs resolve "[[Project Plan]]"
  obsidian-vfs inspect "@obs:architect" --body
  obsidian-vfs list-skills
  obsidian-vfs list-skills --json
  obsidian-vfs provision-skills
  obsidian-vfs provision-skills --dry-run
  obsidian-vfs provision-skills --include deploy --include review
  obsidian-vfs provision-skills --exclude "draft-*"
  obsidian-vfs list-agents
  obsidian-vfs list-agents --json
  obsidian-vfs provision-agents
  obsidian-vfs provision-agents --dry-run
  obsidian-vfs provision-agents --include architect --include reviewer
  obsidian-vfs provision-agents --exclude "draft-*"`;
}

/** Format a usage error with the correct usage hint. */
export function formatUsageError(message: string): string {
  return `Error: ${message}\n\nRun 'obsidian-vfs --help' for usage.`;
}
