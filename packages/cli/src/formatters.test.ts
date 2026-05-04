import type { VFSError } from "@obsidian-vfs/core";
import { describe, expect, it } from "vitest";

import type { InspectOutput, ProvisionSkillsOutput, ResolveOutput } from "./types.js";
import {
  formatError,
  formatHelp,
  formatInspectJSON,
  formatInspectResult,
  formatProvisionSkillsJSON,
  formatProvisionSkillsResult,
  formatResolveCandidates,
  formatResolveJSON,
  formatResolveResult,
  formatUsageError,
  formatVerboseTiming,
} from "./formatters.js";

const sampleInspect: InspectOutput = {
  mention: "@obs:architect",
  targetType: "agent",
  resolvedPath: "30-resources/ai/staff/architect.md",
  physicalPath: "/Users/me/vault/30-resources/ai/staff/architect.md",
  vaultName: "My Vault",
  section: undefined,
  contentLength: 42,
  content: "Some agent content here.",
};

const sampleResolve: ResolveOutput = {
  wikilink: "Project Plan",
  resolvedPath: "10-projects/Project Plan.md",
  physicalPath: "/Users/me/vault/10-projects/Project Plan.md",
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

  it("formats NOT_IMPLEMENTED", () => {
    const err: VFSError = { code: "NOT_IMPLEMENTED", message: "nope" };
    expect(formatError(err)).toContain("Not implemented");
  });
});

describe("formatInspectResult", () => {
  it("renders all header fields", () => {
    const result = formatInspectResult(sampleInspect, { full: false });
    expect(result).toContain("Mention:");
    expect(result).toContain("@obs:architect");
    expect(result).toContain("Target Type:");
    expect(result).toContain("agent");
    expect(result).toContain("Vault Path:");
    expect(result).toContain("30-resources/ai/staff/architect.md");
    expect(result).toContain("Physical Path:");
    expect(result).toContain("/Users/me/vault/30-resources/ai/staff/architect.md");
    expect(result).toContain("Vault:");
    expect(result).toContain("My Vault");
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
    expect(parsed.data.mention).toBe("@obs:architect");
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
    expect(result).toContain('"Project Plan"');
    expect(result).toContain('"10-projects/Project Plan.md"');
    expect(result).toContain('"/Users/me/vault/10-projects/Project Plan.md"');
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
    expect(parsed.data.wikilink).toBe("Project Plan");
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

describe("formatProvisionSkillsResult", () => {
  const baseOutput: ProvisionSkillsOutput = {
    written: ["deploy", "review"],
    permissionsAdded: 2,
    dryRun: false,
    errors: [],
  };

  it("renders written skills and permissions", () => {
    const result = formatProvisionSkillsResult(baseOutput);
    expect(result).toContain("deploy, review");
    expect(result).toContain("added 2");
  });

  it("shows correct count in header", () => {
    const result = formatProvisionSkillsResult(baseOutput);
    expect(result).toContain("Wrote 2 skills");
  });

  it("shows (none) when no skills written", () => {
    const result = formatProvisionSkillsResult({ ...baseOutput, written: [] });
    expect(result).toContain("(none)");
  });

  it("prefixes with [dry-run] when dryRun is true", () => {
    const result = formatProvisionSkillsResult({ ...baseOutput, dryRun: true });
    expect(result).toContain("[dry-run]");
  });

  it("includes errors when present", () => {
    const result = formatProvisionSkillsResult({
      ...baseOutput,
      errors: ["Failed to write proxy"],
    });
    expect(result).toContain("error: Failed to write proxy");
  });

  it("renders correctly when all operations fail", () => {
    const result = formatProvisionSkillsResult({
      written: [],
      permissionsAdded: 0,
      dryRun: false,
      errors: ["Error A", "Error B"],
    });
    expect(result).toContain("Wrote 0 skills");
    expect(result).toContain("error: Error A");
    expect(result).toContain("error: Error B");
  });
});

describe("formatProvisionSkillsJSON", () => {
  it("serializes output as JSON", () => {
    const output: ProvisionSkillsOutput = {
      written: ["deploy"],
      permissionsAdded: 1,
      dryRun: false,
      errors: [],
    };
    const json = formatProvisionSkillsJSON(output);
    const parsed = JSON.parse(json) as ProvisionSkillsOutput;
    expect(parsed.written).toEqual(["deploy"]);
    expect(parsed.permissionsAdded).toBe(1);
    expect(parsed.dryRun).toBe(false);
  });

  it("serializes dry-run output with errors", () => {
    const output: ProvisionSkillsOutput = {
      written: ["a"],
      permissionsAdded: 1,
      dryRun: true,
      errors: ["some error"],
    };
    const json = formatProvisionSkillsJSON(output);
    const parsed = JSON.parse(json) as ProvisionSkillsOutput;
    expect(parsed.dryRun).toBe(true);
    expect(parsed.errors).toEqual(["some error"]);
  });
});

describe("formatHelp", () => {
  it("contains all command names", () => {
    const help = formatHelp();
    expect(help).toContain("inspect");
    expect(help).toContain("resolve");
    expect(help).toContain("provision-skills");
    expect(help).toContain("--json");
    expect(help).toContain("--verbose");
    expect(help).toContain("--full");
    expect(help).toContain("--body");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--cli-path");
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
