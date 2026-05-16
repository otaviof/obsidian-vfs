import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListResourcesArgs } from "./types.js";
import { EXIT_SUCCESS } from "./types.js";
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
import { formatListResourcesResult, writeStdout } from "./formatters.js";
import { run } from "./cmd-list-agents.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockWriteStdout = vi.mocked(writeStdout);
const mockFormatResult = vi.mocked(formatListResourcesResult);

const agentDefaults = {
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

  it("delegates to cmd-list-resources with agents kind", async () => {
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
      { description: false },
    );
    expect(mockWriteStdout).toHaveBeenCalled();
  });

  it("passes description flag to formatter", async () => {
    const tracker = makeListAgentsTracker({
      ok: true,
      value: [makeDiscoveredResource(agentDefaults)],
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs({ description: true }));

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ resources: [makeDiscoveredResource(agentDefaults)], count: 1 }),
      "agents",
      { description: true },
    );
  });
});
