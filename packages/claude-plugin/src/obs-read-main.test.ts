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

import {
  bootstrapTracker,
  resolveMention,
  resolveExecConfig,
  resolveSkillMention,
} from "@obsidian-vfs/core";
import type { LocalIndexTracker, MentionResult, VFSResult } from "@obsidian-vfs/core";

import { run } from "./obs-read-main.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockResolveMention = vi.mocked(resolveMention);
const mockResolveSkillMention = vi.mocked(resolveSkillMention);
const mockResolveExecConfig = vi.mocked(resolveExecConfig);

/** Capture writes to process.stdout and process.stderr. */
function captureIO(): { stdout: string; stderr: string } {
  const captured = { stdout: "", stderr: "" };
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    captured.stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    captured.stderr += String(chunk);
    return true;
  });
  return captured;
}

/** Build a successful mention result. */
function mentionResult(content: string): VFSResult<MentionResult> {
  return {
    ok: true,
    value: {
      targetType: "file",
      resolvedPath: "note.md",
      vaultName: "Vault",
      content,
      section: undefined,
    },
  };
}

describe("obs-read-main", () => {
  const fakeTracker = { context: { name: "Vault" } } as unknown as LocalIndexTracker;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockBootstrap.mockResolvedValue({ ok: true, value: { tracker: fakeTracker, initMs: 1 } });
  });

  it("exits 2 with usage message when no argument", async () => {
    const io = captureIO();
    const code = await run([]);
    expect(code).toBe(2);
    expect(io.stderr).toContain("Usage:");
  });

  it("normalizes bare name to @obs: prefix", async () => {
    const io = captureIO();
    mockResolveMention.mockResolvedValueOnce(mentionResult("content"));
    await run(["architect"]);
    expect(mockResolveMention).toHaveBeenCalledWith("@obs:architect", fakeTracker);
    expect(io.stdout).toBe("content");
  });

  it("preserves existing @obs: prefix", async () => {
    captureIO();
    mockResolveMention.mockResolvedValueOnce(mentionResult("content"));
    await run(["@obs:architect"]);
    expect(mockResolveMention).toHaveBeenCalledWith("@obs:architect", fakeTracker);
  });

  it("preserves existing /obs: prefix", async () => {
    captureIO();
    mockResolveSkillMention.mockResolvedValueOnce(mentionResult("skill content"));
    await run(["/obs:deploy"]);
    expect(mockResolveSkillMention).toHaveBeenCalledWith("/obs:deploy", fakeTracker);
  });

  it("dispatches /obs: to resolveSkillMention", async () => {
    captureIO();
    mockResolveSkillMention.mockResolvedValueOnce(mentionResult("skill"));
    await run(["/obs:deploy"]);
    expect(mockResolveSkillMention).toHaveBeenCalledTimes(1);
    expect(mockResolveMention).not.toHaveBeenCalled();
  });

  it("dispatches @obs: to resolveMention", async () => {
    captureIO();
    mockResolveMention.mockResolvedValueOnce(mentionResult("note"));
    await run(["@obs:note"]);
    expect(mockResolveMention).toHaveBeenCalledTimes(1);
    expect(mockResolveSkillMention).not.toHaveBeenCalled();
  });

  it("writes content to stdout on success", async () => {
    const io = captureIO();
    mockResolveMention.mockResolvedValueOnce(mentionResult("Hello world"));
    const code = await run(["note"]);
    expect(code).toBe(0);
    expect(io.stdout).toBe("Hello world");
  });

  it("no trailing newline in stdout", async () => {
    const io = captureIO();
    mockResolveMention.mockResolvedValueOnce(mentionResult("content"));
    await run(["note"]);
    expect(io.stdout).toBe("content");
    expect(io.stdout.endsWith("\n")).toBe(false);
  });

  it("writes error to stderr on bootstrap failure", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "VAULT_NOT_FOUND", message: "Vault not found" },
    });
    const io = captureIO();
    await run(["note"]);
    expect(io.stderr).toContain("Vault not found");
  });

  it("returns 1 on bootstrap failure", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "VAULT_NOT_FOUND", message: "Vault not found" },
    });
    captureIO();
    const code = await run(["note"]);
    expect(code).toBe(1);
  });

  it("writes error to stderr on resolution failure", async () => {
    mockResolveMention.mockResolvedValueOnce({
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "File not found: missing" },
    });
    const io = captureIO();
    await run(["missing"]);
    expect(io.stderr).toContain("File not found: missing");
  });

  it("returns 1 on resolution failure", async () => {
    mockResolveMention.mockResolvedValueOnce({
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "File not found" },
    });
    captureIO();
    const code = await run(["missing"]);
    expect(code).toBe(1);
  });

  it("resolves config from environment variables", async () => {
    captureIO();
    mockResolveMention.mockResolvedValueOnce(mentionResult("content"));
    await run(["note"]);
    expect(mockResolveExecConfig).toHaveBeenCalledWith(process.env);
  });
});
