import type { LocalIndexTracker, VFSResult, WikilinkResolution } from "@obsidian-vfs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolveArgs } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS, EXIT_USAGE } from "./types.js";

vi.mock("./bootstrap.js", () => ({
  bootstrapTracker: vi.fn(),
}));

vi.mock("./formatters.js", () => ({
  formatError: vi.fn((err: { message: string }) => `ERROR: ${err.message}`),
  formatResolveCandidates: vi.fn(() => "CANDIDATES"),
  formatResolveResult: vi.fn((_out: unknown) => "RESOLVE_RESULT"),
  formatResolveJSON: vi.fn((r: unknown) => JSON.stringify(r)),
  formatUsageError: vi.fn((msg: string) => `USAGE: ${msg}`),
  formatVerboseTiming: vi.fn(
    (label: string, ms: number) => `[verbose] ${label}: ${ms.toFixed(1)}ms`,
  ),
  writeStdout: vi.fn(),
  writeStderr: vi.fn(),
}));

import { bootstrapTracker } from "./bootstrap.js";
import {
  formatResolveCandidates,
  formatResolveJSON,
  formatResolveResult,
  formatUsageError,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";
import { run } from "./cmd-resolve.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockWriteStdout = vi.mocked(writeStdout);
const mockWriteStderr = vi.mocked(writeStderr);
const mockFormatResolveResult = vi.mocked(formatResolveResult);
const mockFormatResolveJSON = vi.mocked(formatResolveJSON);
const mockFormatUsageError = vi.mocked(formatUsageError);
const mockFormatResolveCandidates = vi.mocked(formatResolveCandidates);
const mockFormatVerboseTiming = vi.mocked(formatVerboseTiming);

function makeArgs(overrides: Partial<ResolveArgs> = {}): ResolveArgs {
  return {
    wikilink: "Project Plan",
    json: false,
    verbose: false,
    cliPath: "obsidian",
    timeoutMs: 10_000,
    ...overrides,
  };
}

function makeTracker(resolveResult: VFSResult<WikilinkResolution>) {
  const resolveWikilink = vi.fn<LocalIndexTracker["resolveWikilink"]>();
  resolveWikilink.mockResolvedValue(resolveResult);
  const tracker = {
    context: { physicalPath: "/Users/me/vault" },
    resolveWikilink,
  } as unknown as LocalIndexTracker;
  return { tracker, resolveWikilink };
}

describe("cmd-resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns EXIT_SUCCESS on successful resolution", async () => {
    const { tracker } = makeTracker({
      ok: true,
      value: { resolvedPath: "10-projects/Project Plan.md", candidates: [] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockWriteStdout).toHaveBeenCalled();
  });

  it("strips [[brackets]] from input", async () => {
    const { tracker, resolveWikilink } = makeTracker({
      ok: true,
      value: { resolvedPath: "10-projects/Project Plan.md", candidates: [] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ wikilink: "[[Project Plan]]" }));

    expect(resolveWikilink).toHaveBeenCalledWith("Project Plan");
  });

  it("strips |alias from input", async () => {
    const { tracker, resolveWikilink } = makeTracker({
      ok: true,
      value: { resolvedPath: "10-projects/Project Plan.md", candidates: [] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ wikilink: "[[Project Plan|My Plan]]" }));

    expect(resolveWikilink).toHaveBeenCalledWith("Project Plan");
  });

  it("handles bare name input", async () => {
    const { tracker, resolveWikilink } = makeTracker({
      ok: true,
      value: { resolvedPath: "10-projects/Project Plan.md", candidates: [] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ wikilink: "Project Plan" }));

    expect(resolveWikilink).toHaveBeenCalledWith("Project Plan");
  });

  it("strips brackets and alias combined", async () => {
    const { tracker, resolveWikilink } = makeTracker({
      ok: true,
      value: { resolvedPath: "a.md", candidates: [] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ wikilink: "[[A|B]]" }));

    expect(resolveWikilink).toHaveBeenCalledWith("A");
  });

  it("outputs JSON on success with --json", async () => {
    const { tracker } = makeTracker({
      ok: true,
      value: { resolvedPath: "10-projects/Project Plan.md", candidates: [] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ json: true }));

    expect(mockFormatResolveJSON).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    expect(mockWriteStdout).toHaveBeenCalled();
  });

  it("outputs JSON on error with --json", async () => {
    const { tracker } = makeTracker({
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "not found" },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs({ json: true }));

    expect(code).toBe(EXIT_ERROR);
    expect(mockFormatResolveJSON).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it("returns EXIT_ERROR on bootstrap failure", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "VAULT_NOT_FOUND", message: "no vault" },
    });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_ERROR);
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("returns EXIT_USAGE for empty wikilink after stripping", async () => {
    const code = await run(makeArgs({ wikilink: "[[]]" }));

    expect(code).toBe(EXIT_USAGE);
    expect(mockFormatUsageError).toHaveBeenCalled();
  });

  it("trims whitespace from input", async () => {
    const { tracker, resolveWikilink } = makeTracker({
      ok: true,
      value: { resolvedPath: "10-projects/Project Plan.md", candidates: [] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ wikilink: "  Project Plan  " }));

    expect(resolveWikilink).toHaveBeenCalledWith("Project Plan");
  });

  it("writes verbose timing to stderr", async () => {
    const { tracker } = makeTracker({
      ok: true,
      value: { resolvedPath: "path.md", candidates: [] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 33 } });

    await run(makeArgs({ verbose: true }));

    expect(mockFormatVerboseTiming).toHaveBeenCalledWith("Resolution", expect.any(Number));
    expect(mockFormatVerboseTiming).toHaveBeenCalledWith("Init", 33);
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("computes physical path from vault and resolved path", async () => {
    const { tracker } = makeTracker({
      ok: true,
      value: { resolvedPath: "folder/note.md", candidates: [] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    expect(mockFormatResolveResult).toHaveBeenCalledWith(
      expect.objectContaining({
        physicalPath: "/Users/me/vault/folder/note.md",
      }),
    );
  });

  it("writes candidates warning to stderr when multiple candidates exist", async () => {
    const candidates = ["archive/note.md", "docs/note.md"];
    const { tracker } = makeTracker({
      ok: true,
      value: { resolvedPath: "docs/note.md", candidates },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ wikilink: "note" }));

    expect(mockFormatResolveCandidates).toHaveBeenCalledWith("note", "docs/note.md", candidates);
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("does not write candidates warning for single candidate", async () => {
    const { tracker } = makeTracker({
      ok: true,
      value: { resolvedPath: "docs/note.md", candidates: ["docs/note.md"] },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ wikilink: "note" }));

    expect(mockFormatResolveCandidates).not.toHaveBeenCalled();
  });

  it("includes candidates in JSON output", async () => {
    const candidates = ["archive/note.md", "docs/note.md"];
    const { tracker } = makeTracker({
      ok: true,
      value: { resolvedPath: "docs/note.md", candidates },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ wikilink: "note", json: true }));

    expect(mockFormatResolveJSON).toHaveBeenCalled();
    const call = mockFormatResolveJSON.mock.calls[0]?.[0] as {
      ok: boolean;
      data?: { candidates: string[] };
    };
    expect(call.ok).toBe(true);
    expect(call.data?.candidates).toEqual(candidates);
  });
});
