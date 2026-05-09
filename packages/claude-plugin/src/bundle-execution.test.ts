import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("bundle execution", () => {
  const binPath = resolve(import.meta.dirname, "../../../bin/obs-hook-handler");

  /** Execute hook handler bin script with JSON input via stdin. */
  async function runHookHandler(input: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
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
        resolve({ stdout, stderr });
      });

      proc.on("error", (err) => {
        reject(err);
      });

      proc.stdin.write(input);
      proc.stdin.end();
    });
  }

  it("bundle executes via bin script and returns empty output for no mentions", async () => {
    const input = JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      session_id: "test",
      transcript_path: "/tmp",
      cwd: "/tmp",
      prompt: "hello world",
    });

    const result = await runHookHandler(input);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).toBe("");
  });

  it("bundle executes and returns empty output for invalid JSON input", async () => {
    const result = await runHookHandler("not json");
    expect(result.stdout.trim()).toBe("{}");
  });

  it("bundle executes and returns empty output for wrong hook event", async () => {
    const input = JSON.stringify({
      hook_event_name: "PreToolUse",
      session_id: "test",
      transcript_path: "/tmp",
      cwd: "/tmp",
      prompt: "@obs:test",
    });

    const result = await runHookHandler(input);
    expect(result.stdout.trim()).toBe("{}");
  });

  it("bundle executes and returns empty output for missing required fields", async () => {
    const input = JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      prompt: "@obs:test",
    });

    const result = await runHookHandler(input);
    expect(result.stdout.trim()).toBe("{}");
  });

  it("bundle executes and handles @obs: mention (bootstrap failure expected)", async () => {
    const input = JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      session_id: "test",
      transcript_path: "/tmp",
      cwd: "/tmp",
      prompt: "Check @obs:architect",
    });

    const result = await runHookHandler(input);
    const output = JSON.parse(result.stdout.trim()) as {
      hookSpecificOutput?: { additionalContext?: string };
    };

    expect(output).toHaveProperty("hookSpecificOutput");
    expect(output.hookSpecificOutput).toHaveProperty("additionalContext");
    expect(output.hookSpecificOutput?.additionalContext).toContain("@obs:architect");
    expect(output.hookSpecificOutput?.additionalContext).toContain("Error:");
  });
});
