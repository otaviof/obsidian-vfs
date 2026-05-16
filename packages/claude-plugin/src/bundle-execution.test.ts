import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Execute a bin script with JSON input via stdin. */
async function runBin(
  binScript: string,
  input: string,
): Promise<{ stdout: string; stderr: string }> {
  const binPath = resolve(import.meta.dirname, "../../../bin", binScript);
  return new Promise((res, reject) => {
    const proc = spawn("node", [binPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", () => {
      res({ stdout, stderr });
    });

    proc.on("error", (err) => {
      reject(err);
    });

    proc.stdin.write(input);
    proc.stdin.end();
  });
}

describe("bundle execution", () => {
  describe("obs-hook-handler", () => {
    it("returns empty output for no mentions", async () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "test",
        transcript_path: "/tmp",
        cwd: "/tmp",
        prompt: "hello world",
      });

      const result = await runBin("obs-hook-handler", input);
      expect(result.stdout.trim()).toBe("{}");
      expect(result.stderr).toBe("");
    });

    it("returns empty output for invalid JSON input", async () => {
      const result = await runBin("obs-hook-handler", "not json");
      expect(result.stdout.trim()).toBe("{}");
    });

    it("returns empty output for wrong hook event", async () => {
      const input = JSON.stringify({
        hook_event_name: "PreToolUse",
        session_id: "test",
        transcript_path: "/tmp",
        cwd: "/tmp",
        prompt: "@obs:test",
      });

      const result = await runBin("obs-hook-handler", input);
      expect(result.stdout.trim()).toBe("{}");
    });

    it("returns empty output for missing required fields", async () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        prompt: "@obs:test",
      });

      const result = await runBin("obs-hook-handler", input);
      expect(result.stdout.trim()).toBe("{}");
    });

    it("handles @obs: mention (bootstrap failure expected)", async () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "test",
        transcript_path: "/tmp",
        cwd: "/tmp",
        prompt: "Check @obs:architect",
      });

      const result = await runBin("obs-hook-handler", input);
      const output = JSON.parse(result.stdout.trim()) as {
        hookSpecificOutput?: { additionalContext?: string };
      };

      expect(output).toHaveProperty("hookSpecificOutput");
      expect(output.hookSpecificOutput).toHaveProperty("additionalContext");
      expect(output.hookSpecificOutput?.additionalContext).toContain("@obs:architect");
      expect(output.hookSpecificOutput?.additionalContext).toContain("Error:");
    });
  });

  describe("obs-expansion-handler", () => {
    it("returns empty output for non-proxy skill", async () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptExpansion",
        session_id: "test",
        transcript_path: "/tmp",
        cwd: "/tmp",
        command_name: "nonexistent-skill",
        expansion_type: "skill",
        command_source: "project",
      });

      const result = await runBin("obs-expansion-handler", input);
      expect(result.stdout.trim()).toBe("{}");
    });

    it("returns empty output for wrong hook event", async () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "test",
        transcript_path: "/tmp",
        cwd: "/tmp",
        command_name: "test",
      });

      const result = await runBin("obs-expansion-handler", input);
      expect(result.stdout.trim()).toBe("{}");
    });
  });

  describe("obs-subagent-handler", () => {
    it("returns empty output for nonexistent agent", async () => {
      const input = JSON.stringify({
        hook_event_name: "SubagentStart",
        session_id: "test",
        transcript_path: "/tmp",
        cwd: "/tmp",
        agent_type: "nonexistent-agent",
      });

      const result = await runBin("obs-subagent-handler", input);
      expect(result.stdout.trim()).toBe("{}");
    });

    it("returns empty output for wrong hook event", async () => {
      const input = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "test",
        transcript_path: "/tmp",
        cwd: "/tmp",
        agent_type: "test",
      });

      const result = await runBin("obs-subagent-handler", input);
      expect(result.stdout.trim()).toBe("{}");
    });
  });
});
