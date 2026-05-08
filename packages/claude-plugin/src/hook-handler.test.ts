import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const cliPath = (actual.resolveCliPath as () => string)();
  return {
    ...actual,
    ObsidianCLIImpl: vi.fn(),
    LocalIndexTracker: {
      create: vi.fn(),
    },
    bootstrapTracker: vi.fn(),
    resolveMention: vi.fn(),
    resolveSkillMention: vi.fn(),
    resolveExecConfig: vi.fn().mockReturnValue({ cliPath, timeoutMs: 10_000 }),
  };
});

import { bootstrapTracker, resolveMention, resolveSkillMention } from "@obsidian-vfs/core";
import type { LocalIndexTracker, MentionResult, VFSResult } from "@obsidian-vfs/core";

import { extractMentions } from "./mention-extractor.js";
import { formatContext } from "./context-formatter.js";
import { parseInput } from "./hook-handler.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockResolveMention = vi.mocked(resolveMention);
const mockResolveSkillMention = vi.mocked(resolveSkillMention);

/** Build a valid HookInput JSON string. */
function hookInput(prompt: string): string {
  return JSON.stringify({
    hook_event_name: "UserPromptSubmit",
    session_id: "test",
    transcript_path: "/tmp",
    cwd: "/tmp",
    prompt,
  });
}

describe("hook-handler", () => {
  const fakeTracker = { context: { name: "Vault" } } as unknown as LocalIndexTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBootstrap.mockResolvedValue({ ok: true, value: { tracker: fakeTracker, initMs: 1 } });
  });

  describe("parseInput", () => {
    it("returns null for invalid JSON", () => {
      expect(parseInput("not json")).toBeNull();
    });

    it("returns null for wrong hook event name", () => {
      const input = JSON.stringify({ hook_event_name: "PreToolUse", prompt: "test" });
      expect(parseInput(input)).toBeNull();
    });

    it("returns null for missing prompt", () => {
      const input = JSON.stringify({ hook_event_name: "UserPromptSubmit" });
      expect(parseInput(input)).toBeNull();
    });

    it("returns null for missing session_id", () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        prompt: "test",
        transcript_path: "/tmp",
        cwd: "/tmp",
      });
      expect(parseInput(input)).toBeNull();
    });

    it("returns null for missing transcript_path", () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        prompt: "test",
        session_id: "s",
        cwd: "/tmp",
      });
      expect(parseInput(input)).toBeNull();
    });

    it("returns null for missing cwd", () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        prompt: "test",
        session_id: "s",
        transcript_path: "/tmp",
      });
      expect(parseInput(input)).toBeNull();
    });

    it("parses valid hook input", () => {
      const result = parseInput(hookInput("hello"));
      expect(result).not.toBeNull();
    });
  });

  describe("mention extraction", () => {
    it("finds no mentions in a normal prompt", () => {
      const mentions = extractMentions("Just a normal prompt");
      expect(mentions).toHaveLength(0);
    });

    it("finds no mentions in an empty prompt", () => {
      const mentions = extractMentions("");
      expect(mentions).toHaveLength(0);
    });

    it("ignores mentions in code blocks", () => {
      const mentions = extractMentions("```\n@obs:fake\n```");
      expect(mentions).toHaveLength(0);
    });

    it("extracts a single mention", () => {
      const mentions = extractMentions("Check @obs:architect");
      expect(mentions).toHaveLength(1);
      expect(mentions[0].reference).toBe("architect");
    });

    it("extracts section-targeted mentions", () => {
      const mentions = extractMentions("@obs:note#Header");
      expect(mentions).toHaveLength(1);
      expect(mentions[0].reference).toBe("note#Header");
    });

    it("extracts file mentions with paths", () => {
      const mentions = extractMentions("@obs:10-projects/plan.md");
      expect(mentions).toHaveLength(1);
      expect(mentions[0].reference).toBe("10-projects/plan.md");
    });
  });

  describe("mention resolution", () => {
    it("resolves a single mention successfully", async () => {
      const mentionResult: VFSResult<MentionResult> = {
        ok: true,
        value: {
          targetType: "agent",
          resolvedPath: "agents/architect.md",
          vaultName: "Vault",
          content: "You are an architect.",
          section: undefined,
        },
      };
      mockResolveMention.mockResolvedValueOnce(mentionResult);

      const mentions = extractMentions("Check @obs:architect");
      const result = await resolveMention("@obs:architect", fakeTracker);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const context = formatContext([
          {
            status: "resolved",
            mention: mentions[0],
            targetType: result.value.targetType,
            resolvedPath: result.value.resolvedPath,
            section: result.value.section,
            content: result.value.content,
          },
        ]);
        expect(context).toContain("@obs:architect");
        expect(context).toContain("You are an architect.");
        expect(context).toContain("(agent,");
      }
    });

    it("handles resolution failure for one mention among many", async () => {
      mockResolveMention
        .mockResolvedValueOnce({
          ok: true,
          value: {
            targetType: "file" as const,
            resolvedPath: "exists.md",
            vaultName: "Vault",
            content: "File content",
            section: undefined,
          },
        })
        .mockResolvedValueOnce({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "File not found: missing" },
        });

      const mentions = extractMentions("@obs:exists @obs:missing");
      expect(mentions).toHaveLength(2);

      const resolved = await Promise.all(
        mentions.map(async (m) => {
          const result = await resolveMention("@obs:" + m.reference, fakeTracker);
          if (result.ok) {
            return {
              status: "resolved" as const,
              mention: m,
              targetType: result.value.targetType,
              resolvedPath: result.value.resolvedPath,
              section: result.value.section,
              content: result.value.content,
            };
          }
          return {
            status: "error" as const,
            mention: m,
            errorMessage: result.error.message,
          };
        }),
      );

      const context = formatContext(resolved);
      expect(context).toContain("File content");
      expect(context).toContain("Error: File not found: missing");
    });
  });

  describe("bootstrap failure", () => {
    it("reports error for all mentions when bootstrap fails", async () => {
      mockBootstrap.mockResolvedValueOnce({
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: "Vault not found" },
      });

      const mentions = extractMentions("@obs:a @obs:b");
      expect(mentions).toHaveLength(2);

      const boot = await bootstrapTracker({ cliPath: "obsidian", timeoutMs: 10_000 });
      expect(boot.ok).toBe(false);

      if (!boot.ok) {
        const errorBlocks = mentions.map((m) => `[obs: ${m.raw} -- Error: ${boot.error.message}]`);
        const context = errorBlocks.join("\n\n");
        expect(context).toContain("@obs:a");
        expect(context).toContain("@obs:b");
        expect(context).toContain("Vault not found");
      }
    });
  });

  describe("context formatting", () => {
    it("produces empty string for no mentions", () => {
      expect(formatContext([])).toBe("");
    });

    it("includes target type in agent header", async () => {
      mockResolveMention.mockResolvedValueOnce({
        ok: true,
        value: {
          targetType: "agent",
          resolvedPath: "agents/a.md",
          vaultName: "Vault",
          content: "Agent",
          section: undefined,
        },
      });

      const mentions = extractMentions("@obs:agent-name");
      const result = await resolveMention("@obs:agent-name", fakeTracker);

      if (result.ok) {
        const context = formatContext([
          {
            status: "resolved",
            mention: mentions[0],
            targetType: result.value.targetType,
            resolvedPath: result.value.resolvedPath,
            section: result.value.section,
            content: result.value.content,
          },
        ]);
        expect(context).toContain("(agent,");
      }
    });

    it("section-sliced content is formatted with section header", async () => {
      mockResolveMention.mockResolvedValueOnce({
        ok: true,
        value: {
          targetType: "file",
          resolvedPath: "note.md",
          vaultName: "Vault",
          content: "Section content",
          section: "Header",
        },
      });

      const mentions = extractMentions("@obs:note#Header");
      const result = await resolveMention("@obs:note#Header", fakeTracker);

      if (result.ok) {
        const context = formatContext([
          {
            status: "resolved",
            mention: mentions[0],
            targetType: result.value.targetType,
            resolvedPath: result.value.resolvedPath,
            section: result.value.section,
            content: result.value.content,
          },
        ]);
        expect(context).toContain("section: Header");
      }
    });
  });

  describe("/obs: skill resolution", () => {
    it("resolves /obs: mention as skill via core", () => {
      mockResolveSkillMention.mockResolvedValueOnce({
        ok: true,
        value: {
          targetType: "skill",
          resolvedPath: "skills/obsidian/SKILL.md",
          vaultName: "Vault",
          content: "Skill content here",
          section: undefined,
        },
      });

      const mentions = extractMentions("Use /obs:obsidian");
      expect(mentions).toHaveLength(1);
      expect(mentions[0].kind).toBe("skill");

      const context = formatContext([
        {
          status: "resolved",
          mention: mentions[0],
          targetType: "skill",
          resolvedPath: "skills/obsidian/SKILL.md",
          section: undefined,
          content: "Skill content here",
        },
      ]);
      expect(context).toContain("/obs:obsidian");
      expect(context).toContain("(skill,");
      expect(context).toContain("Skill content here");
    });

    it("handles mixed @obs: and /obs: mentions", () => {
      const mentions = extractMentions("@obs:architect and /obs:obsidian");
      expect(mentions).toHaveLength(2);
      expect(mentions[0].kind).toBe("context");
      expect(mentions[0].reference).toBe("architect");
      expect(mentions[1].kind).toBe("skill");
      expect(mentions[1].reference).toBe("obsidian");
    });

    it("reports error when skill not found", () => {
      mockResolveSkillMention.mockResolvedValueOnce({
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: "Skill not found: missing" },
      });

      const mentions = extractMentions("/obs:missing");
      expect(mentions).toHaveLength(1);
      expect(mentions[0].kind).toBe("skill");

      const context = formatContext([
        {
          status: "error",
          mention: mentions[0],
          errorMessage: "Skill not found: missing",
        },
      ]);
      expect(context).toContain("Error: Skill not found: missing");
    });
  });
});
