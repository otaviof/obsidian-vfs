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
import type { VFSResult, MentionResult } from "@obsidian-vfs/core";

import { handlePromptSubmit, parseInput } from "./hook-handler.js";
import { fakeLocalIndexTracker } from "./test-helpers.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockResolveMention = vi.mocked(resolveMention);
const mockResolveSkillMention = vi.mocked(resolveSkillMention);

/** Build a valid HookInput object. */
function hookInput(prompt: string) {
  return {
    hook_event_name: "UserPromptSubmit" as const,
    session_id: "test",
    transcript_path: "/tmp",
    cwd: "/tmp",
    prompt,
  };
}

describe("hook-handler", () => {
  const fakeTracker = fakeLocalIndexTracker();

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

    it.each([
      [
        "session_id",
        {
          hook_event_name: "UserPromptSubmit",
          prompt: "t",
          transcript_path: "/",
          cwd: "/",
        },
      ],
      [
        "transcript_path",
        {
          hook_event_name: "UserPromptSubmit",
          prompt: "t",
          session_id: "s",
          cwd: "/",
        },
      ],
      [
        "cwd",
        {
          hook_event_name: "UserPromptSubmit",
          prompt: "t",
          session_id: "s",
          transcript_path: "/",
        },
      ],
      [
        "prompt",
        {
          hook_event_name: "UserPromptSubmit",
          session_id: "s",
          transcript_path: "/",
          cwd: "/",
        },
      ],
    ])("returns null for missing %s", (_field, input) => {
      expect(parseInput(JSON.stringify(input))).toBeNull();
    });

    it("parses valid hook input", () => {
      const result = parseInput(JSON.stringify(hookInput("hello")));
      expect(result).not.toBeNull();
    });
  });

  describe("handlePromptSubmit", () => {
    it("returns {} when prompt has no mentions", async () => {
      const result = await handlePromptSubmit(hookInput("Just a normal prompt"));
      expect(result).toEqual({});
      expect(mockBootstrap).not.toHaveBeenCalled();
    });

    it("resolves single @obs: mention successfully", async () => {
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

      const result = await handlePromptSubmit(hookInput("Check @obs:architect"));

      expect(mockResolveMention).toHaveBeenCalledOnce();
      expect(result.hookSpecificOutput).toBeDefined();
      const ctx = result.hookSpecificOutput!.additionalContext!;
      expect(ctx).toContain("@obs:architect");
      expect(ctx).toContain("(agent,");
      expect(ctx).toContain("You are an architect.");
      expect(ctx).toContain('path: "/vault/agents/architect.md"');
    });

    it("dispatches /obs: mention to resolveSkillMention", async () => {
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

      const result = await handlePromptSubmit(hookInput("Use /obs:obsidian"));

      expect(mockResolveSkillMention).toHaveBeenCalledOnce();
      expect(mockResolveMention).not.toHaveBeenCalled();
      const ctx = result.hookSpecificOutput!.additionalContext!;
      expect(ctx).toContain("/obs:obsidian");
      expect(ctx).toContain("(skill,");
      expect(ctx).toContain("Skill content here");
    });

    it("dispatches mixed @obs: and /obs: mentions to correct resolvers", async () => {
      mockResolveMention.mockResolvedValueOnce({
        ok: true,
        value: {
          targetType: "file",
          resolvedPath: "note.md",
          vaultName: "Vault",
          content: "Note content",
          section: undefined,
        },
      });
      mockResolveSkillMention.mockResolvedValueOnce({
        ok: true,
        value: {
          targetType: "skill",
          resolvedPath: "skills/obsidian/SKILL.md",
          vaultName: "Vault",
          content: "Skill content",
          section: undefined,
        },
      });

      const result = await handlePromptSubmit(hookInput("@obs:note and /obs:obsidian"));

      expect(mockResolveMention).toHaveBeenCalledOnce();
      expect(mockResolveSkillMention).toHaveBeenCalledOnce();
      const ctx = result.hookSpecificOutput!.additionalContext!;
      expect(ctx).toContain("Note content");
      expect(ctx).toContain("Skill content");
    });

    it("produces mixed output when one mention resolves and another fails", async () => {
      mockResolveMention
        .mockResolvedValueOnce({
          ok: true,
          value: {
            targetType: "file",
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

      const result = await handlePromptSubmit(hookInput("@obs:exists @obs:missing"));

      const ctx = result.hookSpecificOutput!.additionalContext!;
      expect(ctx).toContain("File content");
      expect(ctx).toContain("Error: File not found: missing");
    });

    it("reports error for all mentions when bootstrap fails", async () => {
      mockBootstrap.mockResolvedValueOnce({
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: "Vault not found" },
      });

      const result = await handlePromptSubmit(hookInput("@obs:a @obs:b"));

      const ctx = result.hookSpecificOutput!.additionalContext!;
      expect(ctx).toContain("@obs:a");
      expect(ctx).toContain("@obs:b");
      expect(ctx).toContain("Vault not found");
      expect(mockResolveMention).not.toHaveBeenCalled();
    });

    it("includes header block even when resolved content is empty", async () => {
      mockResolveMention.mockResolvedValueOnce({
        ok: true,
        value: {
          targetType: "file",
          resolvedPath: "empty.md",
          vaultName: "Vault",
          content: "",
          section: undefined,
        },
      });

      const result = await handlePromptSubmit(hookInput("@obs:empty"));

      expect(result.hookSpecificOutput).toBeDefined();
    });
  });
});
