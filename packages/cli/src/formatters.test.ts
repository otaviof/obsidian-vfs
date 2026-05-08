import type { VFSError } from "@obsidian-vfs/core";
import { describe, expect, it } from "vitest";

import type { InspectOutput, ListResourcesOutput, ProvisionOutput, ResolveOutput } from "./types.js";
import {
  formatError,
  formatHelp,
  formatInspectJSON,
  formatInspectResult,
  formatListResourcesJSON,
  formatListResourcesResult,
  formatProvisionJSON,
  formatProvisionResult,
  formatResolveCandidates,
  formatResolveJSON,
  formatResolveResult,
  formatUsageError,
  formatVerboseTiming,
} from "./formatters.js";

/** Fixture vault root path. */
const VAULT_ROOT = "/Users/me/vault";

/** Fixture vault display name. */
const VAULT_NAME = "My Vault";

/** Fixture inspect mention. */
const INSPECT_MENTION = "@obs:architect";

/** Fixture inspect vault-relative path. */
const INSPECT_RESOLVED_PATH = "30-resources/ai/staff/architect.md";

/** Fixture inspect content. */
const INSPECT_CONTENT = "Some agent content here.";

/** Fixture resolve wikilink input. */
const RESOLVE_WIKILINK = "Project Plan";

/** Fixture resolve vault-relative path. */
const RESOLVE_RESOLVED_PATH = "10-projects/Project Plan.md";

const sampleInspect: InspectOutput = {
  mention: INSPECT_MENTION,
  targetType: "agent",
  resolvedPath: INSPECT_RESOLVED_PATH,
  physicalPath: `${VAULT_ROOT}/${INSPECT_RESOLVED_PATH}`,
  vaultName: VAULT_NAME,
  section: undefined,
  contentLength: INSPECT_CONTENT.length,
  content: INSPECT_CONTENT,
};

const sampleResolve: ResolveOutput = {
  wikilink: RESOLVE_WIKILINK,
  resolvedPath: RESOLVE_RESOLVED_PATH,
  physicalPath: `${VAULT_ROOT}/${RESOLVE_RESOLVED_PATH}`,
  candidates: [],
};

describe("formatError", () => {
  it("formats VAULT_NOT_FOUND with hint", () => {
    const err: VFSError = { code: "VAULT_NOT_FOUND", message: "no vault" };
    const result = formatError(err);
    expect(result).toContain("Vault not found");
    expect(result).toContain("OBSIDIAN_VAULT");
  });

  it("formats CLI_UNAVAILABLE with hint", () => {
    const err: VFSError = { code: "CLI_UNAVAILABLE", message: "not found" };
    const result = formatError(err);
    expect(result).toContain("CLI unavailable");
    expect(result).toContain("PATH");
  });

  it("formats FILE_NOT_FOUND", () => {
    const err: VFSError = { code: "FILE_NOT_FOUND", message: "missing" };
    expect(formatError(err)).toContain("File not found");
  });

  it("formats PARSE_ERROR", () => {
    const err: VFSError = { code: "PARSE_ERROR", message: "bad json" };
    expect(formatError(err)).toContain("Parse error");
  });

  it("formats CLI_ERROR", () => {
    const err: VFSError = { code: "CLI_ERROR", message: "failed" };
    expect(formatError(err)).toContain("CLI error");
  });

  it("formats TIMEOUT", () => {
    const err: VFSError = { code: "TIMEOUT", message: "timed out" };
    expect(formatError(err)).toContain("Timeout");
  });

  it("formats PERMISSION_DENIED", () => {
    const err: VFSError = { code: "PERMISSION_DENIED", message: "denied" };
    expect(formatError(err)).toContain("Permission denied");
  });

  it("formats INVALID_URI", () => {
    const err: VFSError = { code: "INVALID_URI", message: "bad uri" };
    expect(formatError(err)).toContain("Invalid reference");
  });
});

describe("formatInspectResult", () => {
  it("renders all header fields", () => {
    const result = formatInspectResult(sampleInspect, { full: false });
    expect(result).toContain("Mention:");
    expect(result).toContain(INSPECT_MENTION);
    expect(result).toContain("Target Type:");
    expect(result).toContain("agent");
    expect(result).toContain("Vault Path:");
    expect(result).toContain(INSPECT_RESOLVED_PATH);
    expect(result).toContain("Physical Path:");
    expect(result).toContain(`${VAULT_ROOT}/${INSPECT_RESOLVED_PATH}`);
    expect(result).toContain("Vault:");
    expect(result).toContain(VAULT_NAME);
  });

  it("shows section when defined", () => {
    const withSection = { ...sampleInspect, section: "Architecture" };
    const result = formatInspectResult(withSection, { full: false });
    expect(result).toContain("Section:");
    expect(result).toContain("Architecture");
  });

  it("omits section when undefined", () => {
    const result = formatInspectResult(sampleInspect, { full: false });
    expect(result).not.toContain("Section:");
  });

  it("truncates content beyond 80 lines", () => {
    const longContent = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
    const output = { ...sampleInspect, content: longContent, contentLength: longContent.length };
    const result = formatInspectResult(output, { full: false });
    expect(result).toContain("[... 20 more lines]");
    expect(result).not.toContain("Line 81");
  });

  it("does not truncate short content", () => {
    const shortContent = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join("\n");
    const output = { ...sampleInspect, content: shortContent, contentLength: shortContent.length };
    const result = formatInspectResult(output, { full: false });
    expect(result).not.toContain("[...");
    expect(result).toContain("Line 10");
  });

  it("shows full content with full flag", () => {
    const longContent = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
    const output = { ...sampleInspect, content: longContent, contentLength: longContent.length };
    const result = formatInspectResult(output, { full: true });
    expect(result).not.toContain("[...");
    expect(result).toContain("Line 100");
  });
});

describe("formatInspectJSON", () => {
  it("serializes success result", () => {
    const json = formatInspectJSON({ ok: true, data: sampleInspect });
    const parsed = JSON.parse(json) as { ok: boolean; data: InspectOutput };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.mention).toBe(INSPECT_MENTION);
  });

  it("serializes error result", () => {
    const err: VFSError = { code: "FILE_NOT_FOUND", message: "missing" };
    const json = formatInspectJSON({ ok: false, error: err });
    const parsed = JSON.parse(json) as { ok: boolean; error: VFSError };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("FILE_NOT_FOUND");
  });
});

describe("formatResolveResult", () => {
  it("renders wikilink and paths with quotes", () => {
    const result = formatResolveResult(sampleResolve);
    expect(result).toContain(`"${RESOLVE_WIKILINK}"`);
    expect(result).toContain(`"${RESOLVE_RESOLVED_PATH}"`);
    expect(result).toContain(`"${VAULT_ROOT}/${RESOLVE_RESOLVED_PATH}"`);
  });
});

describe("formatResolveCandidates", () => {
  it("lists all candidates with resolved marker", () => {
    const result = formatResolveCandidates("note", "docs/note.md", [
      "archive/note.md",
      "docs/note.md",
      "ref/note-draft.md",
    ]);
    expect(result).toContain("3 search results");
    expect(result).toContain('"note"');
    expect(result).toContain('"archive/note.md"');
    expect(result).toContain('"docs/note.md"  <-- resolved');
    expect(result).toContain('"ref/note-draft.md"');
    expect(result).not.toContain('"archive/note.md"  <-- resolved');
  });

  it("marks resolved path when it is not the first candidate", () => {
    const result = formatResolveCandidates("cfg", "b/cfg.md", ["a/cfg.md", "b/cfg.md"]);
    expect(result).toContain('"b/cfg.md"  <-- resolved');
    expect(result).not.toContain('"a/cfg.md"  <-- resolved');
  });
});

describe("formatResolveJSON", () => {
  it("serializes success result", () => {
    const json = formatResolveJSON({ ok: true, data: sampleResolve });
    const parsed = JSON.parse(json) as { ok: boolean; data: ResolveOutput };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.wikilink).toBe(RESOLVE_WIKILINK);
  });
});

describe("formatVerboseTiming", () => {
  it("includes label and ms value", () => {
    const result = formatVerboseTiming("Resolution", 123.456);
    expect(result).toContain("[verbose]");
    expect(result).toContain("Resolution");
    expect(result).toContain("123.5ms");
  });
});

describe("formatListResourcesResult", () => {
  it("renders compact output without descriptions by default", () => {
    const output: ListResourcesOutput = {
      resources: [
        { name: "deploy", description: "Deploy helper", vaultRelativePath: "skills/deploy" },
        { name: "review", description: "Code reviewer", vaultRelativePath: "skills/review" },
      ],
      count: 2,
    };
    const result = formatListResourcesResult(output, "skills", { description: false });
    expect(result).toContain("Found 2 skills:");
    expect(result).toContain("deploy");
    expect(result).toContain("skills/deploy");
    expect(result).toContain("review");
    expect(result).toContain("skills/review");
    expect(result).not.toContain("Deploy helper");
    expect(result).not.toContain("Code reviewer");
  });

  it("renders descriptions when description flag is true", () => {
    const output: ListResourcesOutput = {
      resources: [
        { name: "deploy", description: "Deploy helper", vaultRelativePath: "skills/deploy" },
        { name: "review", description: "Code reviewer", vaultRelativePath: "skills/review" },
      ],
      count: 2,
    };
    const result = formatListResourcesResult(output, "skills", { description: true });
    expect(result).toContain("Found 2 skills:");
    expect(result).toContain("deploy");
    expect(result).toContain("Deploy helper");
    expect(result).toContain("skills/deploy");
    expect(result).toContain("review");
    expect(result).toContain("Code reviewer");
    expect(result).toContain("skills/review");
  });

  it("truncates long descriptions with ellipsis at 50 chars", () => {
    const longDesc = "A".repeat(60);
    const output: ListResourcesOutput = {
      resources: [{ name: "test", description: longDesc, vaultRelativePath: "skills/test" }],
      count: 1,
    };
    const result = formatListResourcesResult(output, "skills", { description: true });
    expect(result).toContain("…");
    expect(result).not.toContain("A".repeat(60));
  });

  it("handles empty list", () => {
    const result = formatListResourcesResult({ resources: [], count: 0 }, "skills", {
      description: false,
    });
    expect(result).toBe("Found 0 skills.");
  });

  it("renders agents with correct kind", () => {
    const output: ListResourcesOutput = {
      resources: [
        {
          name: "architect",
          description: "System architect",
          vaultRelativePath: "agents/architect.md",
        },
      ],
      count: 1,
    };
    const result = formatListResourcesResult(output, "agents", { description: false });
    expect(result).toContain("Found 1 agents:");
    expect(result).toContain("architect");
  });
});

describe("formatListResourcesJSON", () => {
  it("serializes output", () => {
    const output: ListResourcesOutput = {
      resources: [
        { name: "deploy", description: "Deploy helper", vaultRelativePath: "skills/deploy" },
      ],
      count: 1,
    };
    const json = formatListResourcesJSON(output);
    const parsed = JSON.parse(json) as ListResourcesOutput;
    expect(parsed.resources).toHaveLength(1);
    expect(parsed.count).toBe(1);
  });
});

describe("formatProvisionResult", () => {
  const noFilter = {
    include: [] as string[],
    exclude: [] as string[],
    discoveredCount: 2,
    filteredCount: 2,
  };
  const baseOutput: ProvisionOutput = {
    written: ["deploy", "review"],
    skipped: [],
    permissionsAdded: 2,
    dryRun: false,
    errors: [],
    filter: noFilter,
  };

  it("renders written resources and permissions", () => {
    const result = formatProvisionResult(baseOutput, "skills");
    expect(result).toContain("deploy, review");
    expect(result).toContain("added 2");
  });

  it("shows correct count in header", () => {
    const result = formatProvisionResult(baseOutput, "skills");
    expect(result).toContain("Wrote 2 skills");
  });

  it("shows (none) when no resources written", () => {
    const result = formatProvisionResult({ ...baseOutput, written: [] }, "skills");
    expect(result).toContain("(none)");
  });

  it("prefixes with [dry-run] when dryRun is true", () => {
    const result = formatProvisionResult({ ...baseOutput, dryRun: true }, "skills");
    expect(result).toContain("[dry-run]");
  });

  it("includes errors when present", () => {
    const result = formatProvisionResult(
      {
        ...baseOutput,
        errors: ["Failed to write proxy"],
      },
      "skills",
    );
    expect(result).toContain("error: Failed to write proxy");
  });

  it("renders correctly when all operations fail", () => {
    const result = formatProvisionResult(
      {
        ...baseOutput,
        written: [],
        permissionsAdded: 0,
        errors: ["Error A", "Error B"],
      },
      "skills",
    );
    expect(result).toContain("Wrote 0 skills");
    expect(result).toContain("error: Error A");
    expect(result).toContain("error: Error B");
  });

  it("shows skipped when present", () => {
    const result = formatProvisionResult(
      {
        ...baseOutput,
        written: ["deploy"],
        skipped: ["draft-notes", "draft-review"],
        filter: { include: [], exclude: ["draft-*"], discoveredCount: 3, filteredCount: 1 },
      },
      "skills",
    );
    expect(result).toContain("skipped:");
    expect(result).toContain("draft-notes, draft-review");
  });

  it("shows filter summary when filter is active", () => {
    const result = formatProvisionResult(
      {
        ...baseOutput,
        written: ["deploy"],
        skipped: ["draft-notes", "draft-review"],
        filter: { include: [], exclude: ["draft-*"], discoveredCount: 3, filteredCount: 1 },
      },
      "skills",
    );
    expect(result).toContain("filter:");
    expect(result).toContain('--exclude "draft-*"');
    expect(result).toContain("3 discovered, 1 provisioned");
  });

  it("omits filter lines when no filter is active", () => {
    const result = formatProvisionResult(baseOutput, "skills");
    expect(result).not.toContain("skipped:");
    expect(result).not.toContain("filter:");
  });

  it("uses correct resource kind for agents", () => {
    const result = formatProvisionResult({ ...baseOutput, written: ["architect"] }, "agents");
    expect(result).toContain("Wrote 1 agents");
  });
});

describe("formatProvisionJSON", () => {
  const noFilter = {
    include: [] as string[],
    exclude: [] as string[],
    discoveredCount: 1,
    filteredCount: 1,
  };

  it("serializes output as JSON", () => {
    const output: ProvisionOutput = {
      written: ["deploy"],
      skipped: [],
      permissionsAdded: 1,
      dryRun: false,
      errors: [],
      filter: noFilter,
    };
    const json = formatProvisionJSON(output);
    const parsed = JSON.parse(json) as ProvisionOutput;
    expect(parsed.written).toEqual(["deploy"]);
    expect(parsed.permissionsAdded).toBe(1);
    expect(parsed.dryRun).toBe(false);
  });

  it("serializes dry-run output with errors", () => {
    const output: ProvisionOutput = {
      written: ["a"],
      skipped: [],
      permissionsAdded: 1,
      dryRun: true,
      errors: ["some error"],
      filter: noFilter,
    };
    const json = formatProvisionJSON(output);
    const parsed = JSON.parse(json) as ProvisionOutput;
    expect(parsed.dryRun).toBe(true);
    expect(parsed.errors).toEqual(["some error"]);
  });
});

describe("formatHelp", () => {
  it("contains all command names", () => {
    const help = formatHelp();
    expect(help).toContain("inspect");
    expect(help).toContain("resolve");
    expect(help).toContain("list-skills");
    expect(help).toContain("provision-skills");
    expect(help).toContain("list-agents");
    expect(help).toContain("provision-agents");
    expect(help).toContain("--json");
    expect(help).toContain("--verbose");
    expect(help).toContain("--full");
    expect(help).toContain("--body");
    expect(help).toContain("--description");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--include");
    expect(help).toContain("--exclude");
    expect(help).toContain("--timeout");
    expect(help).toContain("--help");
  });
});

describe("formatUsageError", () => {
  it("contains message and help hint", () => {
    const result = formatUsageError("Unknown command: foo");
    expect(result).toContain("Unknown command: foo");
    expect(result).toContain("--help");
  });
});
