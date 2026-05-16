import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const cliPath = (actual.resolveCliPath as () => string)();
  return {
    ...actual,
    bootstrapTracker: vi.fn(),
    resolveMention: vi.fn(),
    resolveExecConfig: vi.fn().mockReturnValue({ cliPath, timeoutMs: 10_000 }),
  };
});

import { bootstrapTracker, resolveMention } from "@obsidian-vfs/core";
import type { VFSResult, MentionResult } from "@obsidian-vfs/core";

import { parseSubagentInput, handleSubagentStart } from "./subagent-handler.js";
import { fakeLocalIndexTracker } from "./test-helpers.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockResolveMention = vi.mocked(resolveMention);

describe("subagent-handler", () => {
  let cwd: string;
  const fakeTracker = fakeLocalIndexTracker();

  beforeEach(() => {
    vi.clearAllMocks();
    cwd = mkdtempSync(join(tmpdir(), "subagent-"));
    mockBootstrap.mockResolvedValue({ ok: true, value: { tracker: fakeTracker, initMs: 1 } });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  describe("parseSubagentInput", () => {
    it("returns null for invalid JSON", () => {
      expect(parseSubagentInput("not json")).toBeNull();
    });

    it("returns null for wrong hook event name", () => {
      const input = JSON.stringify({ hook_event_name: "UserPromptSubmit" });
      expect(parseSubagentInput(input)).toBeNull();
    });

    it("returns null for missing agent_type", () => {
      const input = JSON.stringify({
        hook_event_name: "SubagentStart",
        session_id: "s",
        transcript_path: "/tmp",
        cwd: "/tmp",
      });
      expect(parseSubagentInput(input)).toBeNull();
    });

    it("parses valid subagent input", () => {
      const input = JSON.stringify({
        hook_event_name: "SubagentStart",
        session_id: "s",
        transcript_path: "/tmp",
        cwd: "/tmp",
        agent_id: "a1",
        agent_type: "my-agent",
      });
      const result = parseSubagentInput(input);
      expect(result).not.toBeNull();
      expect(result!.agent_type).toBe("my-agent");
    });
  });

  describe("handleSubagentStart", () => {
    it("rejects path traversal in agent_type", async () => {
      const input: Parameters<typeof handleSubagentStart>[0] = {
        hook_event_name: "SubagentStart",
        session_id: "s",
        transcript_path: "/tmp",
        cwd,
        agent_type: "../../../etc/passwd",
      };
      const result = await handleSubagentStart(input);
      expect(result).toEqual({});
    });

    it("returns {} when agent file does not exist", async () => {
      const input: Parameters<typeof handleSubagentStart>[0] = {
        hook_event_name: "SubagentStart",
        session_id: "s",
        transcript_path: "/tmp",
        cwd,
        agent_id: "a1",
        agent_type: "nonexistent",
      };
      const result = await handleSubagentStart(input);
      expect(result).toEqual({});
    });

    it("returns {} when agent body has no obs:// URIs", async () => {
      const agentDir = join(cwd, ".claude", "agents");
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, "plain-agent.md"), "# Agent\nNo vault links here.\n");

      const input: Parameters<typeof handleSubagentStart>[0] = {
        hook_event_name: "SubagentStart",
        session_id: "s",
        transcript_path: "/tmp",
        cwd,
        agent_id: "a1",
        agent_type: "plain-agent",
      };
      const result = await handleSubagentStart(input);
      expect(result).toEqual({});
      expect(mockBootstrap).not.toHaveBeenCalled();
    });

    it("resolves obs:// URI references from agent body", async () => {
      const agentDir = join(cwd, ".claude", "agents");
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(
        join(agentDir, "vault-agent.md"),
        "# Agent\nSee [note](obs://drafts/my-note) for context.\n",
      );

      const refResult: VFSResult<MentionResult> = {
        ok: true,
        value: {
          targetType: "file",
          resolvedPath: "my-note.md",
          vaultName: "drafts",
          content: "Resolved note content",
          section: undefined,
        },
      };
      mockResolveMention.mockResolvedValueOnce(refResult);

      const input: Parameters<typeof handleSubagentStart>[0] = {
        hook_event_name: "SubagentStart",
        session_id: "s",
        transcript_path: "/tmp",
        cwd,
        agent_id: "a1",
        agent_type: "vault-agent",
      };
      const result = await handleSubagentStart(input);
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.additionalContext).toContain("Resolved note content");
    });

    it("handles tracker bootstrap failure", async () => {
      const agentDir = join(cwd, ".claude", "agents");
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, "fail-agent.md"), "# Agent\nSee [note](obs://drafts/my-note).\n");

      mockBootstrap.mockResolvedValueOnce({
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: "Vault not found" },
      });

      const input: Parameters<typeof handleSubagentStart>[0] = {
        hook_event_name: "SubagentStart",
        session_id: "s",
        transcript_path: "/tmp",
        cwd,
        agent_id: "a1",
        agent_type: "fail-agent",
      };
      const result = await handleSubagentStart(input);
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.additionalContext).toContain("Vault not found");
    });
  });
});
