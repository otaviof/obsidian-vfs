import { describe, expect, it } from "vitest";

import type { ExtractedMention, ResolvedMention } from "./types.js";
import { formatContext } from "./context-formatter.js";

function mention(
  raw: string,
  reference: string,
  kind: "context" | "skill" = "context",
): ExtractedMention {
  return { kind, raw, reference, startIndex: 0, endIndex: raw.length };
}

describe("formatContext", () => {
  it("returns empty string for no mentions", () => {
    expect(formatContext([])).toBe("");
  });

  it("formats a single resolved mention", () => {
    const resolved: ResolvedMention = {
      status: "resolved",
      mention: mention("@obs:architect", "architect"),
      targetType: "agent",
      resolvedPath: "30-resources/ai/staff/architect.md",
      absolutePath: "/vault/30-resources/ai/staff/architect.md",
      section: undefined,
      content: "You are an architect.",
    };
    const result = formatContext([resolved]);
    expect(result).toContain(
      '--- @obs:architect (agent, 30-resources/ai/staff/architect.md, path: "/vault/30-resources/ai/staff/architect.md") ---',
    );
    expect(result).toContain("You are an architect.");
  });

  it("includes section in header when present", () => {
    const resolved: ResolvedMention = {
      status: "resolved",
      mention: mention("@obs:plan.md#Architecture", "plan.md#Architecture"),
      targetType: "file",
      resolvedPath: "10-projects/plan.md",
      absolutePath: "/vault/10-projects/plan.md",
      section: "Architecture",
      content: "Design overview.",
    };
    const result = formatContext([resolved]);
    expect(result).toContain('path: "/vault/10-projects/plan.md", section: Architecture');
  });

  it("formats an error mention", () => {
    const error: ResolvedMention = {
      status: "error",
      mention: mention("@obs:missing", "missing"),
      errorMessage: "File not found: missing",
    };
    const result = formatContext([error]);
    expect(result).toBe("[obs: @obs:missing -- Error: File not found: missing]");
  });

  it("separates multiple mentions with blank lines", () => {
    const mentions: ResolvedMention[] = [
      {
        status: "resolved",
        mention: mention("@obs:a", "a"),
        targetType: "file",
        resolvedPath: "a.md",
        absolutePath: "/vault/a.md",
        section: undefined,
        content: "Content A",
      },
      {
        status: "resolved",
        mention: mention("@obs:b", "b"),
        targetType: "agent",
        resolvedPath: "b.md",
        absolutePath: "/vault/b.md",
        section: undefined,
        content: "Content B",
      },
      {
        status: "error",
        mention: mention("@obs:c", "c"),
        errorMessage: "Not found",
      },
    ];
    const result = formatContext(mentions);
    const blocks = result.split("\n\n");
    expect(blocks).toHaveLength(3);
  });

  it("uses correct type label for agent", () => {
    const resolved: ResolvedMention = {
      status: "resolved",
      mention: mention("@obs:agent", "agent"),
      targetType: "agent",
      resolvedPath: "agents/agent.md",
      absolutePath: "/vault/agents/agent.md",
      section: undefined,
      content: "Agent content",
    };
    expect(formatContext([resolved])).toContain("(agent,");
  });

  it("uses correct type label for file", () => {
    const resolved: ResolvedMention = {
      status: "resolved",
      mention: mention("@obs:file", "file"),
      targetType: "file",
      resolvedPath: "file.md",
      absolutePath: "/vault/file.md",
      section: undefined,
      content: "File content",
    };
    expect(formatContext([resolved])).toContain("(file,");
  });

  it("uses correct type label for skill", () => {
    const resolved: ResolvedMention = {
      status: "resolved",
      mention: mention("/obs:skill", "skill", "skill"),
      targetType: "skill",
      resolvedPath: "skills/skill/SKILL.md",
      absolutePath: "/vault/skills/skill/SKILL.md",
      section: undefined,
      content: "Skill content",
    };
    const result = formatContext([resolved]);
    expect(result).toContain("/obs:skill");
    expect(result).toContain("(skill,");
  });

  it("renders mixed resolved and error mentions", () => {
    const mentions: ResolvedMention[] = [
      {
        status: "resolved",
        mention: mention("@obs:good", "good"),
        targetType: "file",
        resolvedPath: "good.md",
        absolutePath: "/vault/good.md",
        section: undefined,
        content: "Good content",
      },
      {
        status: "error",
        mention: mention("@obs:bad", "bad"),
        errorMessage: "Permission denied",
      },
    ];
    const result = formatContext(mentions);
    expect(result).toContain("Good content");
    expect(result).toContain("Error: Permission denied");
  });

  it("formats /obs: skill mention with correct raw prefix", () => {
    const resolved: ResolvedMention = {
      status: "resolved",
      mention: mention("/obs:obsidian", "obsidian", "skill"),
      targetType: "skill",
      resolvedPath: "skills/obsidian/SKILL.md",
      absolutePath: "/vault/skills/obsidian/SKILL.md",
      section: undefined,
      content: "Obsidian skill content",
    };
    const result = formatContext([resolved]);
    expect(result).toContain(
      '--- /obs:obsidian (skill, skills/obsidian/SKILL.md, path: "/vault/skills/obsidian/SKILL.md") ---',
    );
    expect(result).toContain("Obsidian skill content");
  });

  it("handles paths with spaces correctly", () => {
    const resolved: ResolvedMention = {
      status: "resolved",
      mention: mention("@obs:my note", "my note"),
      targetType: "file",
      resolvedPath: "10-projects/my note.md",
      absolutePath: "/Users/x/My Vault/10-projects/my note.md",
      section: undefined,
      content: "Note with spaces in path",
    };
    const result = formatContext([resolved]);
    expect(result).toContain('path: "/Users/x/My Vault/10-projects/my note.md"');
  });
});
