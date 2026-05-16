import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VFSResult } from "@obsidian-vfs/core";
import type { ProvisionArgs } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS, EXIT_USAGE } from "./types.js";
import {
  CLI_DEFAULTS,
  FORMAT_ERROR_STUB,
  FORMAT_VERBOSE_TIMING_STUB,
  makeDiscoveredResource,
  makeListAgentsTracker,
  mockSettingsFile,
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
  formatUsageError: vi.fn((msg: string) => `USAGE: ${msg}`),
  writeStdout: vi.fn(),
  writeStderr: vi.fn(),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { bootstrapTracker } from "./bootstrap.js";
import { formatProvisionResult, writeStderr, writeStdout } from "./formatters.js";
import { buildPermissionRule } from "./cmd-provision-resources.js";
import { run } from "./cmd-provision-agents.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockMkdir = vi.mocked(mkdir);
const mockReadFile = vi.mocked(readFile as unknown as (...args: unknown[]) => Promise<unknown>);
const mockWriteFile = vi.mocked(writeFile as unknown as (...args: unknown[]) => Promise<unknown>);
const mockWriteStdout = vi.mocked(writeStdout);
const mockWriteStderr = vi.mocked(writeStderr);
const mockFormatResult = vi.mocked(formatProvisionResult);

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
      undefined,
    );
  });

  it("ensures global obs-read permission", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });
    mockSettingsFile(mockReadFile, "settings.local.json", { permissions: { allow: [] } });

    await run(makeArgs());

    const settingsCall = mockWriteFile.mock.calls.find((c) =>
      String(c[0]).endsWith("settings.local.json"),
    );
    expect(settingsCall).toBeDefined();
    const written = JSON.parse(String(settingsCall![1])) as {
      permissions: { allow: string[] };
    };
    expect(written.permissions.allow).toContain(buildPermissionRule(false));
  });

  it("does not duplicate obs-read permission", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });
    mockSettingsFile(mockReadFile, "settings.local.json", {
      permissions: { allow: [buildPermissionRule(false)] },
    });

    await run(makeArgs());

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ permissionsAdded: 0 }),
      "agents",
      undefined,
    );
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
      undefined,
    );
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
      undefined,
    );
  });

  it("--user provisions agents to ~/.claude/agents/", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ user: true }));

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(path.join(".claude", "agents", "architect.md")),
      expect.any(String),
      "utf-8",
    );
    const agentCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(agentCall).toBeDefined();
    expect(String(agentCall![0])).toContain(os.homedir());
  });

  it("--set model=opus overrides remapped model in proxy content", async () => {
    const vaultWithGemini =
      "---\ndescription: System architect\nmodel: gemini-2.0-flash-lite\n---\n\nYou are an architect.\n";
    const tracker = makeAgentTracker([makeDiscoveredResource(agentDefaults)], {
      ok: true,
      value: vaultWithGemini,
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ set: ["model=opus"] }));

    const writeCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(writeCall).toBeDefined();
    const content = String(writeCall![1]);
    expect(content).toContain("model: opus");
    expect(content).not.toContain("haiku");
    expect(content).not.toContain("gemini");
  });

  it("--set description=custom overrides description in proxy content", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ set: ["description=custom desc"] }));

    const writeCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(writeCall).toBeDefined();
    const content = String(writeCall![1]);
    expect(content).toContain("description: custom desc");
  });

  it("--set with key not in source frontmatter appends it", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ set: ["context=fork"] }));

    const writeCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(writeCall).toBeDefined();
    const content = String(writeCall![1]);
    expect(content).toContain("context: fork");
  });

  it("--unset model removes model line from proxy content", async () => {
    const vaultWithModel =
      "---\ndescription: System architect\nmodel: sonnet\n---\n\nYou are an architect.\n";
    const tracker = makeAgentTracker([makeDiscoveredResource(agentDefaults)], {
      ok: true,
      value: vaultWithModel,
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ unset: ["model"] }));

    const writeCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(writeCall).toBeDefined();
    const content = String(writeCall![1]);
    expect(content).not.toContain("model:");
  });

  it("--unset description removes description from proxy content", async () => {
    const tracker = makeAgentTracker();
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ unset: ["description"] }));

    const writeCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith("architect.md"));
    expect(writeCall).toBeDefined();
    const content = String(writeCall![1]);
    expect(content).not.toContain("description:");
  });

  it("invalid --set value returns EXIT_USAGE", async () => {
    const code = await run(makeArgs({ set: ["invalid"] }));

    expect(code).toBe(EXIT_USAGE);
    expect(mockWriteStderr).toHaveBeenCalled();
    expect(mockBootstrap).not.toHaveBeenCalled();
  });
});
