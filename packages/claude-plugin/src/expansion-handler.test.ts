import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const cliPath = (actual.resolveCliPath as () => string)();
  return {
    ...actual,
    bootstrapTracker: vi.fn(),
    resolveMention: vi.fn(),
    resolveSkillMention: vi.fn(),
    resolveExecConfig: vi.fn().mockReturnValue({ cliPath, timeoutMs: 10_000 }),
  };
});

vi.mock("./proxy-detector.js", () => ({
  detectProxy: vi.fn(),
}));

import { bootstrapTracker, resolveSkillMention, resolveMention } from "@obsidian-vfs/core";
import type { LocalIndexTracker, VFSResult, MentionResult } from "@obsidian-vfs/core";

import { detectProxy } from "./proxy-detector.js";
import { parseExpansionInput, handleExpansion } from "./expansion-handler.js";
import type { ExpansionInput } from "./expansion-handler.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockDetectProxy = vi.mocked(detectProxy);
const mockResolveSkillMention = vi.mocked(resolveSkillMention);
const mockResolveMention = vi.mocked(resolveMention);

/** Build a valid ExpansionInput JSON string. */
function expansionInputJson(commandName: string): string {
  return JSON.stringify({
    hook_event_name: "UserPromptExpansion",
    session_id: "test",
    transcript_path: "/tmp",
    cwd: "/tmp",
    expansion_type: "skill",
    command_name: commandName,
    command_args: "",
    command_source: "project",
    prompt: `/${commandName}`,
  });
}

/** Build a typed ExpansionInput object. */
function expansionInput(commandName: string): ExpansionInput {
  return {
    hook_event_name: "UserPromptExpansion",
    session_id: "test",
    transcript_path: "/tmp",
    cwd: "/tmp",
    expansion_type: "skill",
    command_name: commandName,
    command_args: "",
    command_source: "project",
    prompt: `/${commandName}`,
  };
}

describe("expansion-handler", () => {
  const fakeTracker = {
    context: { name: "Vault", physicalPath: "/vault" },
  } as unknown as LocalIndexTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBootstrap.mockResolvedValue({ ok: true, value: { tracker: fakeTracker, initMs: 1 } });
  });

  describe("parseExpansionInput", () => {
    it("returns null for invalid JSON", () => {
      expect(parseExpansionInput("not json")).toBeNull();
    });

    it("returns null for wrong hook event name", () => {
      const input = JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "test" });
      expect(parseExpansionInput(input)).toBeNull();
    });

    it("returns null for missing command_name", () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptExpansion",
        session_id: "s",
        transcript_path: "/tmp",
        cwd: "/tmp",
      });
      expect(parseExpansionInput(input)).toBeNull();
    });

    it("parses valid expansion input", () => {
      const result = parseExpansionInput(expansionInputJson("spike-skill"));
      expect(result).not.toBeNull();
      expect(result!.command_name).toBe("spike-skill");
    });
  });

  describe("handleExpansion", () => {
    it("returns {} when skill is not a vault proxy", async () => {
      mockDetectProxy.mockResolvedValueOnce(null);

      const result = await handleExpansion(expansionInput("other-skill"));
      expect(result).toEqual({});
    });

    it("returns error context when tracker bootstrap fails", async () => {
      mockDetectProxy.mockResolvedValueOnce({
        isProxy: true,
        skillName: "spike-skill",
        obsMention: "/obs:spike-skill",
      });
      mockBootstrap.mockResolvedValueOnce({
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: "Vault not found" },
      });

      const result = await handleExpansion(expansionInput("spike-skill"));
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.additionalContext).toContain("Vault not found");
    });

    it("returns {} when skill has no wikilink references", async () => {
      mockDetectProxy.mockResolvedValueOnce({
        isProxy: true,
        skillName: "spike-skill",
        obsMention: "/obs:spike-skill",
      });
      const skillResult: VFSResult<MentionResult> = {
        ok: true,
        value: {
          targetType: "skill",
          resolvedPath: "skills/spike-skill/SKILL.md",
          vaultName: "Vault",
          content: "Content without any obs:// links",
          section: undefined,
        },
      };
      mockResolveSkillMention.mockResolvedValueOnce(skillResult);

      const result = await handleExpansion(expansionInput("spike-skill"));
      expect(result).toEqual({});
    });

    it("resolves skill references and returns additionalContext", async () => {
      mockDetectProxy.mockResolvedValueOnce({
        isProxy: true,
        skillName: "spike-skill",
        obsMention: "/obs:spike-skill",
      });
      const skillResult: VFSResult<MentionResult> = {
        ok: true,
        value: {
          targetType: "skill",
          resolvedPath: "skills/spike-skill/SKILL.md",
          vaultName: "Vault",
          content: "Content with [link](obs://drafts/bases#Heading)",
          section: undefined,
        },
      };
      mockResolveSkillMention.mockResolvedValueOnce(skillResult);

      const refResult: VFSResult<MentionResult> = {
        ok: true,
        value: {
          targetType: "file",
          resolvedPath: "bases.md",
          vaultName: "drafts",
          content: "Referenced content",
          section: "Heading",
        },
      };
      mockResolveMention.mockResolvedValueOnce(refResult);

      const result = await handleExpansion(expansionInput("spike-skill"));
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.additionalContext).toContain("Referenced content");
    });

    it("returns error context when skill resolution fails", async () => {
      mockDetectProxy.mockResolvedValueOnce({
        isProxy: true,
        skillName: "spike-skill",
        obsMention: "/obs:spike-skill",
      });
      mockResolveSkillMention.mockResolvedValueOnce({
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: "Skill not found" },
      });

      const result = await handleExpansion(expansionInput("spike-skill"));
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.additionalContext).toContain("Skill not found");
    });
  });
});
