import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListResourcesArgs } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";
import {
  CLI_DEFAULTS,
  FORMAT_ERROR_STUB,
  FORMAT_VERBOSE_TIMING_STUB,
  makeDiscoveredResource,
  makeListAgentsTracker,
} from "./test-helpers.js";

vi.mock("./bootstrap.js", () => ({
  bootstrapTracker: vi.fn(),
}));

vi.mock("./formatters.js", () => ({
  formatError: vi.fn(FORMAT_ERROR_STUB),
  formatListResourcesResult: vi.fn(() => "LIST_RESULT"),
  formatListResourcesJSON: vi.fn((o: unknown) => JSON.stringify(o)),
  formatVerboseTiming: vi.fn(FORMAT_VERBOSE_TIMING_STUB),
  writeStdout: vi.fn(),
  writeStderr: vi.fn(),
}));

import { bootstrapTracker } from "./bootstrap.js";
import {
  formatListResourcesJSON,
  formatListResourcesResult,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";
import { run } from "./cmd-list-agents.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockWriteStdout = vi.mocked(writeStdout);
const mockWriteStderr = vi.mocked(writeStderr);
const mockFormatResult = vi.mocked(formatListResourcesResult);
const mockFormatJSON = vi.mocked(formatListResourcesJSON);

const agentDefaults: { name: string; description: string; vaultRelativePath: string } = {
  name: "architect",
  description: "System architect",
  vaultRelativePath: "agents/architect.md",
};

function makeArgs(overrides: Partial<ListResourcesArgs> = {}): ListResourcesArgs {
  return {
    ...CLI_DEFAULTS,
    ...overrides,
  };
}

describe("cmd-list-agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns EXIT_SUCCESS with agents", async () => {
    const tracker = makeListAgentsTracker({
      ok: true,
      value: [makeDiscoveredResource(agentDefaults)],
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ resources: [makeDiscoveredResource(agentDefaults)], count: 1 }),
      "agents",
    );
    expect(mockWriteStdout).toHaveBeenCalled();
  });

  it("outputs JSON with --json", async () => {
    const tracker = makeListAgentsTracker({
      ok: true,
      value: [makeDiscoveredResource(agentDefaults)],
    });
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

  it("returns EXIT_ERROR on listAgents failure", async () => {
    const tracker = makeListAgentsTracker({
      ok: false,
      error: { code: "CLI_ERROR", message: "listing failed" },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_ERROR);
  });

  it("writes verbose timing to stderr", async () => {
    const tracker = makeListAgentsTracker({
      ok: true,
      value: [makeDiscoveredResource(agentDefaults)],
    });
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

  it("handles empty agent list", async () => {
    const tracker = makeListAgentsTracker({ ok: true, value: [] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ resources: [], count: 0 }),
      "agents",
    );
  });
});
