import type { LocalIndexTracker, MentionResult, VFSResult } from "@obsidian-vfs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InspectArgs } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";

vi.mock("@obsidian-vfs/core", async () => {
  const actual = await vi.importActual("@obsidian-vfs/core");
  return { ...actual, resolveSkillMention: vi.fn() };
});

vi.mock("./bootstrap.js", () => ({
  bootstrapTracker: vi.fn(),
}));

vi.mock("./formatters.js", () => ({
  formatError: vi.fn((err: { message: string }) => `ERROR: ${err.message}`),
  formatInspectResult: vi.fn((_out: unknown, _opts: unknown) => "INSPECT_RESULT"),
  formatInspectJSON: vi.fn((r: unknown) => JSON.stringify(r)),
  formatVerboseTiming: vi.fn(
    (label: string, ms: number) => `[verbose] ${label}: ${ms.toFixed(1)}ms`,
  ),
  writeStdout: vi.fn(),
  writeStderr: vi.fn(),
}));

import { resolveSkillMention } from "@obsidian-vfs/core";
import { bootstrapTracker } from "./bootstrap.js";
import {
  formatError,
  formatInspectJSON,
  formatInspectResult,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";
import { run } from "./cmd-inspect.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockResolveSkillMention = vi.mocked(resolveSkillMention);
const mockWriteStdout = vi.mocked(writeStdout);
const mockWriteStderr = vi.mocked(writeStderr);
const mockFormatInspectResult = vi.mocked(formatInspectResult);
const mockFormatInspectJSON = vi.mocked(formatInspectJSON);
const mockFormatError = vi.mocked(formatError);
const mockFormatVerboseTiming = vi.mocked(formatVerboseTiming);

function makeArgs(overrides: Partial<InspectArgs> = {}): InspectArgs {
  return {
    mention: "architect",
    json: false,
    verbose: false,
    full: false,
    cliPath: "obsidian",
    timeoutMs: 10_000,
    ...overrides,
  };
}

function makeMentionResult(overrides: Partial<MentionResult> = {}): MentionResult {
  return {
    targetType: "agent",
    resolvedPath: "30-resources/ai/staff/architect.md",
    vaultName: "My Vault",
    content: "Agent content",
    section: undefined,
    ...overrides,
  };
}

function makeTracker(resolveMentionResult: VFSResult<MentionResult>) {
  const resolveMention = vi.fn<LocalIndexTracker["resolveMention"]>();
  resolveMention.mockResolvedValue(resolveMentionResult);
  const tracker = {
    context: { physicalPath: "/Users/me/vault", name: "My Vault" },
    resolveMention,
  } as unknown as LocalIndexTracker;
  return { tracker, resolveMention };
}

describe("cmd-inspect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns EXIT_SUCCESS on successful inspection", async () => {
    const { tracker } = makeTracker({ ok: true, value: makeMentionResult() });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockWriteStdout).toHaveBeenCalled();
  });

  it("auto-prefixes @obs: to bare mention", async () => {
    const { tracker, resolveMention } = makeTracker({ ok: true, value: makeMentionResult() });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ mention: "architect" }));

    expect(resolveMention).toHaveBeenCalledWith("@obs:architect");
  });

  it("preserves existing @obs: prefix", async () => {
    const { tracker, resolveMention } = makeTracker({ ok: true, value: makeMentionResult() });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ mention: "@obs:architect" }));

    expect(resolveMention).toHaveBeenCalledWith("@obs:architect");
  });

  it("includes section in output when present", async () => {
    const mention = makeMentionResult({ section: "Architecture" });
    const { tracker } = makeTracker({ ok: true, value: mention });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    expect(mockFormatInspectResult).toHaveBeenCalledWith(
      expect.objectContaining({ section: "Architecture" }),
      expect.any(Object),
    );
  });

  it("passes full flag to formatter", async () => {
    const { tracker } = makeTracker({ ok: true, value: makeMentionResult() });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ full: true }));

    expect(mockFormatInspectResult).toHaveBeenCalledWith(expect.any(Object), { full: true });
  });

  it("outputs JSON on success with --json", async () => {
    const { tracker } = makeTracker({ ok: true, value: makeMentionResult() });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ json: true }));

    expect(mockFormatInspectJSON).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    expect(mockWriteStdout).toHaveBeenCalled();
  });

  it("outputs JSON on resolution error with --json", async () => {
    const { tracker } = makeTracker({
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "not found" },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs({ json: true }));

    expect(code).toBe(EXIT_ERROR);
    expect(mockFormatInspectJSON).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it("returns EXIT_ERROR on bootstrap failure", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "CLI_UNAVAILABLE", message: "not found" },
    });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_ERROR);
    expect(mockWriteStderr).toHaveBeenCalled();
    expect(mockFormatError).toHaveBeenCalled();
  });

  it("returns EXIT_ERROR on resolution failure", async () => {
    const { tracker } = makeTracker({
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "missing" },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_ERROR);
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("writes verbose timing to stderr", async () => {
    const { tracker } = makeTracker({ ok: true, value: makeMentionResult() });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 42 } });

    await run(makeArgs({ verbose: true }));

    expect(mockFormatVerboseTiming).toHaveBeenCalledWith("Resolution", expect.any(Number));
    expect(mockFormatVerboseTiming).toHaveBeenCalledWith("Init", 42);
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("resolves file mention with path", async () => {
    const mention = makeMentionResult({
      targetType: "file",
      resolvedPath: "10-projects/plan.md",
    });
    const { tracker, resolveMention } = makeTracker({ ok: true, value: mention });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs({ mention: "10-projects/plan.md" }));

    expect(code).toBe(EXIT_SUCCESS);
    expect(resolveMention).toHaveBeenCalledWith("@obs:10-projects/plan.md");
  });

  it("computes physical path from vault path and resolved path", async () => {
    const { tracker } = makeTracker({
      ok: true,
      value: makeMentionResult({ resolvedPath: "folder/note.md" }),
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    expect(mockFormatInspectResult).toHaveBeenCalledWith(
      expect.objectContaining({
        physicalPath: "/Users/me/vault/folder/note.md",
      }),
      expect.any(Object),
    );
  });

  it("resolves /obs: mention as skill via resolveSkillMention", async () => {
    const { tracker, resolveMention } = makeTracker({ ok: true, value: makeMentionResult() });
    mockResolveSkillMention.mockResolvedValueOnce({
      ok: true,
      value: {
        targetType: "skill",
        resolvedPath: "skills/obsidian/SKILL.md",
        vaultName: "My Vault",
        content: "Skill content",
        section: undefined,
      },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs({ mention: "/obs:obsidian" }));

    expect(code).toBe(EXIT_SUCCESS);
    expect(resolveMention).not.toHaveBeenCalled();
    expect(mockResolveSkillMention).toHaveBeenCalledWith("/obs:obsidian", tracker);
    expect(mockFormatInspectResult).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "skill",
        resolvedPath: "skills/obsidian/SKILL.md",
      }),
      expect.any(Object),
    );
  });

  it("returns EXIT_ERROR when /obs: skill not found", async () => {
    const { tracker } = makeTracker({ ok: true, value: makeMentionResult() });
    mockResolveSkillMention.mockResolvedValueOnce({
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "Skill not found: missing" },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs({ mention: "/obs:missing" }));

    expect(code).toBe(EXIT_ERROR);
  });
});
