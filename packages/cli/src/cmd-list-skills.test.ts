import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListSkillsArgs } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";
import {
  CLI_DEFAULTS,
  FORMAT_ERROR_STUB,
  FORMAT_VERBOSE_TIMING_STUB,
  makeDiscoveredSkill,
  makeListSkillsTracker,
} from "./test-helpers.js";

vi.mock("./bootstrap.js", () => ({
  bootstrapTracker: vi.fn(),
}));

vi.mock("./formatters.js", () => ({
  formatError: vi.fn(FORMAT_ERROR_STUB),
  formatListSkillsResult: vi.fn(() => "LIST_RESULT"),
  formatListSkillsJSON: vi.fn((o: unknown) => JSON.stringify(o)),
  formatVerboseTiming: vi.fn(FORMAT_VERBOSE_TIMING_STUB),
  writeStdout: vi.fn(),
  writeStderr: vi.fn(),
}));

import { bootstrapTracker } from "./bootstrap.js";
import {
  formatListSkillsJSON,
  formatListSkillsResult,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";
import { run } from "./cmd-list-skills.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockWriteStdout = vi.mocked(writeStdout);
const mockWriteStderr = vi.mocked(writeStderr);
const mockFormatResult = vi.mocked(formatListSkillsResult);
const mockFormatJSON = vi.mocked(formatListSkillsJSON);

function makeArgs(overrides: Partial<ListSkillsArgs> = {}): ListSkillsArgs {
  return {
    ...CLI_DEFAULTS,
    ...overrides,
  };
}

describe("cmd-list-skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns EXIT_SUCCESS with skills", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredSkill()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ skills: [makeDiscoveredSkill()], count: 1 }),
    );
    expect(mockWriteStdout).toHaveBeenCalled();
  });

  it("outputs JSON with --json", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredSkill()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ json: true }));

    expect(mockFormatJSON).toHaveBeenCalled();
    expect(mockFormatResult).not.toHaveBeenCalled();
  });

  it("returns EXIT_ERROR on bootstrap failure", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "CLI_UNAVAILABLE", message: "not found" },
    });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_ERROR);
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("returns EXIT_ERROR on listSkills failure", async () => {
    const tracker = makeListSkillsTracker({
      ok: false,
      error: { code: "CLI_ERROR", message: "listing failed" },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_ERROR);
  });

  it("writes verbose timing to stderr", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredSkill()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 42 } });

    await run(makeArgs({ verbose: true }));

    const mockTiming = vi.mocked(formatVerboseTiming);
    expect(mockTiming).toHaveBeenCalledWith("Enumeration", expect.any(Number));
    expect(mockTiming).toHaveBeenCalledWith("Init", 42);
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("outputs JSON on bootstrap failure with --json", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "CLI_UNAVAILABLE", message: "not found" },
    });

    const code = await run(makeArgs({ json: true }));

    expect(code).toBe(EXIT_ERROR);
    expect(mockWriteStdout).toHaveBeenCalled();
    expect(mockWriteStderr).not.toHaveBeenCalled();
  });

  it("handles empty skill list", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ skills: [], count: 0 }),
    );
  });
});
