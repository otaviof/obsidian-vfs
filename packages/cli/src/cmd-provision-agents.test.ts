import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VFSResult } from "@obsidian-vfs/core";
import type { ProvisionArgs } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";
import {
  CLI_DEFAULTS,
  FORMAT_ERROR_STUB,
  FORMAT_VERBOSE_TIMING_STUB,
  makeDiscoveredResource,
  makeListAgentsTracker,
} from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./bootstrap.js", () => ({
  bootstrapTracker: vi.fn(),
}));

vi.mock("./formatters.js", () => ({
  formatError: vi.fn(FORMAT_ERROR_STUB),
  formatProvisionResult: vi.fn(() => "PROVISION_RESULT"),
  formatProvisionJSON: vi.fn((o: unknown) => JSON.stringify(o)),
  formatVerboseTiming: vi.fn(FORMAT_VERBOSE_TIMING_STUB),
  writeStdout: vi.fn(),
  writeStderr: vi.fn(),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { bootstrapTracker } from "./bootstrap.js";
import {
  formatProvisionJSON,
  formatProvisionResult,
  writeStderr,
  writeStdout,
} from "./formatters.js";
import { CLI_VERSION, buildPermissionRule } from "./cmd-provision-resources.js";
import { run } from "./cmd-provision-agents.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockMkdir = vi.mocked(mkdir);
const mockReadFile = vi.mocked(readFile as unknown as (...args: unknown[]) => Promise<unknown>);
const mockWriteFile = vi.mocked(writeFile as unknown as (...args: unknown[]) => Promise<unknown>);
const mockWriteStdout = vi.mocked(writeStdout);
const mockWriteStderr = vi.mocked(writeStderr);
const mockFormatResult = vi.mocked(formatProvisionResult);
const mockFormatJSON = vi.mocked(formatProvisionJSON);

const agentDefaults = {
  name: "architect",
  description: "System architect",
  vaultRelativePath: "agents/architect.md",
};

const vaultContent =
  "---\ndescription: System architect\ntools: Read, Grep\n---\n\nYou are an architect. See [[Design]].\n";

function makeArgs(overrides: Partial<ProvisionArgs> = {}): ProvisionArgs {
  return {
    dryRun: false,
    include: [],
    exclude: [],
    ...CLI_DEFAULTS,
    ...overrides,
  };
}

function makeAgentTracker(
  agents = [makeDiscoveredResource(agentDefaults)],
  readFileResult: VFSResult<string> = { ok: true, value: vaultContent },
) {
  return makeListAgentsTracker({ ok: true, value: agents }, { readFileResult });
}

describe("cmd-provision-agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("provisions discovered agents", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalled();
    expect(mockWriteStdout).toHaveBeenCalled();
  });

  it("proxy content preserves vault frontmatter", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("architect.md"),
      expect.stringContaining("tools: Read, Grep"),
      "utf-8",
    );
  });

  it("proxy content ensures name field", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("architect.md"),
      expect.stringContaining("name: architect"),
      "utf-8",
    );
  });

  it("proxy content scrubs wikilinks", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    const writeCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(writeCall).toBeDefined();
    const content = String(writeCall![1]);
    expect(content).toContain("[Design](obs://My%20Vault/Design)");
    expect(content).not.toContain("[[Design]]");
  });

  it("proxy content handles no frontmatter", async () => {
    const tracker = makeAgentTracker([makeDiscoveredResource(agentDefaults)], {
      ok: true,
      value: "Just body content with [[Link]].\n",
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    const writeCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(writeCall).toBeDefined();
    const content = String(writeCall![1]);
    expect(content).toContain("name: architect");
    expect(content).toContain("description: System architect");
    expect(content).toContain("[Link](obs://My%20Vault/Link)");
  });

  it("idempotent write skip", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const expectedContent =
      "---\nname: architect\ndescription: System architect\ntools: Read, Grep\n---\n\nYou are an architect. See [Design](obs://My%20Vault/Design).\n";
    mockReadFile.mockImplementation((...args: unknown[]) => {
      const pathArg = String(args[0]);
      if (pathArg.endsWith("architect.md")) return Promise.resolve(expectedContent);
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    await run(makeArgs());

    expect(mockWriteFile).not.toHaveBeenCalledWith(
      expect.stringContaining("architect.md"),
      expect.any(String),
      expect.any(String),
    );
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ written: [] }),
      "agents",
    );
  });

  it("ensures global obs-read permission", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    mockReadFile.mockImplementation((...args: unknown[]) => {
      const pathArg = String(args[0]);
      if (pathArg.endsWith("settings.local.json")) {
        return Promise.resolve(JSON.stringify({ permissions: { allow: [] } }));
      }
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    await run(makeArgs());

    const settingsCall = mockWriteFile.mock.calls.find((c) =>
      String(c[0]).endsWith("settings.local.json"),
    );
    expect(settingsCall).toBeDefined();
    const written = JSON.parse(String(settingsCall![1])) as {
      permissions: { allow: string[] };
    };
    expect(written.permissions.allow).toContain(
      buildPermissionRule(CLI_VERSION),
    );
  });

  it("does not duplicate obs-read permission", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    mockReadFile.mockImplementation((...args: unknown[]) => {
      const pathArg = String(args[0]);
      if (pathArg.endsWith("settings.local.json")) {
        return Promise.resolve(
          JSON.stringify({
            permissions: { allow: [buildPermissionRule(CLI_VERSION)] },
          }),
        );
      }
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    await run(makeArgs());

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ permissionsAdded: 0 }),
      "agents",
    );
  });

  it("dry-run does not write files", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ dryRun: true }));

    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("dry-run lists all as written", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ dryRun: true }));

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ written: ["architect"], dryRun: true }),
      "agents",
    );
  });

  it("outputs JSON with --json", async () => {
    const tracker = makeAgentTracker();
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

  it("captures readFile failure in errors and continues", async () => {
    const agents = [
      makeDiscoveredResource({
        name: "broken",
        description: "Broken",
        vaultRelativePath: "agents/broken.md",
      }),
      makeDiscoveredResource(agentDefaults),
    ];
    const readFileMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: "FILE_NOT_FOUND", message: "missing" } })
      .mockResolvedValueOnce({ ok: true, value: vaultContent });
    const tracker = makeListAgentsTracker(
      { ok: true, value: agents },
      { extraMethods: { readFile: readFileMock } },
    );
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_ERROR);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: ["architect"],
        errors: expect.arrayContaining([expect.stringContaining("broken")]) as unknown[],
      }),
      "agents",
    );
  });

  it("provisions only included agents", async () => {
    const agents = [
      makeDiscoveredResource(agentDefaults),
      makeDiscoveredResource({
        name: "reviewer",
        description: "Reviewer",
        vaultRelativePath: "agents/reviewer.md",
      }),
    ];
    const tracker = makeListAgentsTracker(
      { ok: true, value: agents },
      { readFileResult: { ok: true, value: vaultContent } },
    );
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ include: ["architect"] }));

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: ["architect"],
        skipped: ["reviewer"],
        filter: expect.objectContaining({ discoveredCount: 2, filteredCount: 1 }) as unknown,
      }),
      "agents",
    );
  });

  it("excludes matching agents", async () => {
    const agents = [
      makeDiscoveredResource(agentDefaults),
      makeDiscoveredResource({
        name: "draft-agent",
        description: "Draft",
        vaultRelativePath: "agents/draft-agent.md",
      }),
    ];
    const tracker = makeListAgentsTracker(
      { ok: true, value: agents },
      { readFileResult: { ok: true, value: vaultContent } },
    );
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ exclude: ["draft-*"] }));

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: ["architect"],
        skipped: ["draft-agent"],
      }),
      "agents",
    );
  });

  it("verbose timing output", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 42 } });

    await run(makeArgs({ verbose: true }));

    const { formatVerboseTiming } = await import("./formatters.js");
    const mockTiming = vi.mocked(formatVerboseTiming);
    expect(mockTiming).toHaveBeenCalledWith("Enumeration", expect.any(Number));
    expect(mockTiming).toHaveBeenCalledWith("Init", 42);
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("proxy content maps non-Claude model to Claude equivalent", async () => {
    const vaultWithGemini =
      "---\ndescription: System architect\nmodel: gemini-2.0-flash-lite\n---\n\nYou are an architect.\n";
    const tracker = makeAgentTracker([makeDiscoveredResource(agentDefaults)], {
      ok: true,
      value: vaultWithGemini,
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    const writeCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(writeCall).toBeDefined();
    const content = String(writeCall![1]);
    expect(content).toContain("model: haiku");
    expect(content).not.toContain("gemini");
  });

  it("proxy content preserves already-Claude model", async () => {
    const vaultWithClaude =
      "---\ndescription: System architect\nmodel: sonnet\n---\n\nYou are an architect.\n";
    const tracker = makeAgentTracker([makeDiscoveredResource(agentDefaults)], {
      ok: true,
      value: vaultWithClaude,
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    const writeCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(writeCall).toBeDefined();
    const content = String(writeCall![1]);
    expect(content).toContain("model: sonnet");
  });

  it("multiple agents in single run", async () => {
    const agents = [
      makeDiscoveredResource({
        name: "architect",
        description: "Architect",
        vaultRelativePath: "agents/architect.md",
      }),
      makeDiscoveredResource({
        name: "reviewer",
        description: "Reviewer",
        vaultRelativePath: "agents/reviewer.md",
      }),
    ];
    const tracker = makeListAgentsTracker(
      { ok: true, value: agents },
      { readFileResult: { ok: true, value: vaultContent } },
    );
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: expect.arrayContaining(["architect", "reviewer"]) as unknown[],
      }),
      "agents",
    );
  });
});
