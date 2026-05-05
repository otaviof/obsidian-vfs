import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProvisionArgs } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";
import {
  CLI_DEFAULTS,
  FORMAT_ERROR_STUB,
  FORMAT_VERBOSE_TIMING_STUB,
  makeDiscoveredResource,
  makeListSkillsTracker,
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
import { run } from "./cmd-provision-skills.js";

const mockBootstrap = vi.mocked(bootstrapTracker);
const mockMkdir = vi.mocked(mkdir);
const mockReadFile = vi.mocked(readFile as unknown as (...args: unknown[]) => Promise<unknown>);
const mockWriteFile = vi.mocked(writeFile as unknown as (...args: unknown[]) => Promise<unknown>);
const mockWriteStdout = vi.mocked(writeStdout);
const mockWriteStderr = vi.mocked(writeStderr);
const mockFormatResult = vi.mocked(formatProvisionResult);
const mockFormatJSON = vi.mocked(formatProvisionJSON);

function makeArgs(overrides: Partial<ProvisionArgs> = {}): ProvisionArgs {
  return {
    dryRun: false,
    include: [],
    exclude: [],
    ...CLI_DEFAULTS,
    ...overrides,
  };
}

describe("cmd-provision-skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns EXIT_SUCCESS with discovered skills", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalled();
    expect(mockWriteStdout).toHaveBeenCalled();
  });

  it("writes proxy SKILL.md with correct content", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("deploy/SKILL.md"),
      expect.stringContaining('!`./bin/obs-read "/obs:deploy"`'),
      "utf-8",
    );
  });

  it("skips write when content matches", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const expectedContent = [
      "---",
      "name: deploy",
      "description: Deploy helper",
      "---",
      "",
      '!`./bin/obs-read "/obs:deploy"`',
      "",
    ].join("\n");
    mockReadFile.mockImplementation((...args: unknown[]) => {
      const pathArg = String(args[0]);
      if (pathArg.endsWith("SKILL.md")) return Promise.resolve(expectedContent);
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    await run(makeArgs());

    expect(mockWriteFile).not.toHaveBeenCalledWith(
      expect.stringContaining("SKILL.md"),
      expect.any(String),
      expect.any(String),
    );
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ written: [] }),
      "skills",
    );
  });

  it("adds per-skill permissions for new skills", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
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
    expect(written.permissions.allow).toContainEqual('Bash(./bin/obs-read "/obs:deploy")');
  });

  it("--dry-run does not write files", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ dryRun: true }));

    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("outputs JSON with --json", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
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

  it("creates settings file when missing", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(".claude"), { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("settings.local.json"),
      expect.any(String),
      "utf-8",
    );
  });

  it("captures write error and returns EXIT_ERROR", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });
    mockWriteFile.mockRejectedValueOnce(new Error("disk full"));

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_ERROR);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([expect.stringContaining("disk full")]) as unknown[],
      }),
      "skills",
    );
  });

  it("captures permission sync error and continues", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });
    mockReadFile.mockImplementation((...args: unknown[]) => {
      const pathArg = String(args[0]);
      if (pathArg.endsWith("settings.local.json")) {
        return Promise.resolve("invalid json {{{");
      }
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });
    mockWriteFile.mockImplementation((...args: unknown[]) => {
      const pathArg = String(args[0]);
      if (pathArg.endsWith("settings.local.json")) {
        return Promise.reject(new Error("write failed"));
      }
      return Promise.resolve(undefined);
    });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_ERROR);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([expect.stringContaining("sync permissions")]) as unknown[],
      }),
      "skills",
    );
  });

  it("writes verbose timing to stderr", async () => {
    const tracker = makeListSkillsTracker({ ok: true, value: [makeDiscoveredResource()] });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 42 } });

    await run(makeArgs({ verbose: true }));

    const { formatVerboseTiming } = await import("./formatters.js");
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

  it("outputs JSON on listSkills failure with --json", async () => {
    const tracker = makeListSkillsTracker({
      ok: false,
      error: { code: "CLI_ERROR", message: "listing failed" },
    });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs({ json: true }));

    expect(code).toBe(EXIT_ERROR);
    expect(mockWriteStdout).toHaveBeenCalled();
    expect(mockWriteStderr).not.toHaveBeenCalled();
  });

  it("--dry-run lists all discovered skills as written", async () => {
    const skills = [
      makeDiscoveredResource(),
      makeDiscoveredResource({ name: "review", description: "Reviewer" }),
    ];
    const tracker = makeListSkillsTracker({ ok: true, value: skills });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ dryRun: true }));

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: ["deploy", "review"],
        dryRun: true,
      }),
      "skills",
    );
  });

  it("handles multiple skills in a single run", async () => {
    const skills = [
      makeDiscoveredResource({ name: "deploy", description: "Deployer" }),
      makeDiscoveredResource({ name: "review", description: "Reviewer" }),
      makeDiscoveredResource({ name: "architect", description: "Architect" }),
    ];
    const tracker = makeListSkillsTracker({ ok: true, value: skills });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: expect.arrayContaining(["deploy", "review", "architect"]) as unknown[],
      }),
      "skills",
    );
  });

  it("only reports newly written skills", async () => {
    const skills = [
      makeDiscoveredResource({ name: "deploy", description: "Deployer" }),
      makeDiscoveredResource({ name: "review", description: "Reviewer" }),
    ];
    const tracker = makeListSkillsTracker({ ok: true, value: skills });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    const deployContent = [
      "---",
      "name: deploy",
      "description: Deployer",
      "---",
      "",
      '!`./bin/obs-read "/obs:deploy"`',
      "",
    ].join("\n");

    mockReadFile.mockImplementation((...args: unknown[]) => {
      const pathArg = String(args[0]);
      if (pathArg.endsWith("deploy/SKILL.md")) return Promise.resolve(deployContent);
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    const code = await run(makeArgs());

    expect(code).toBe(EXIT_SUCCESS);
    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({ written: ["review"] }),
      "skills",
    );
  });

  it("provisions only included skills", async () => {
    const skills = [
      makeDiscoveredResource({ name: "deploy", description: "Deployer" }),
      makeDiscoveredResource({ name: "review", description: "Reviewer" }),
    ];
    const tracker = makeListSkillsTracker({ ok: true, value: skills });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ include: ["deploy"] }));

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: ["deploy"],
        skipped: ["review"],
        filter: expect.objectContaining({ discoveredCount: 2, filteredCount: 1 }) as unknown,
      }),
      "skills",
    );
  });

  it("provisions multiple included skills", async () => {
    const skills = [
      makeDiscoveredResource({ name: "deploy", description: "Deployer" }),
      makeDiscoveredResource({ name: "review", description: "Reviewer" }),
      makeDiscoveredResource({ name: "architect", description: "Architect" }),
    ];
    const tracker = makeListSkillsTracker({ ok: true, value: skills });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ include: ["deploy", "review"] }));

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: ["deploy", "review"],
        skipped: ["architect"],
      }),
      "skills",
    );
  });

  it("excludes matching skills", async () => {
    const skills = [
      makeDiscoveredResource({ name: "deploy", description: "Deployer" }),
      makeDiscoveredResource({ name: "draft-notes", description: "Draft notes" }),
    ];
    const tracker = makeListSkillsTracker({ ok: true, value: skills });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ exclude: ["draft-*"] }));

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: ["deploy"],
        skipped: ["draft-notes"],
      }),
      "skills",
    );
  });

  it("no filter provisions all skills with empty skipped", async () => {
    const skills = [makeDiscoveredResource()];
    const tracker = makeListSkillsTracker({ ok: true, value: skills });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs());

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        skipped: [],
        filter: expect.objectContaining({
          include: [],
          exclude: [],
          discoveredCount: 1,
          filteredCount: 1,
        }) as unknown,
      }),
      "skills",
    );
  });

  it("--dry-run with include lists only matching skills", async () => {
    const skills = [
      makeDiscoveredResource({ name: "deploy", description: "Deployer" }),
      makeDiscoveredResource({ name: "review", description: "Reviewer" }),
    ];
    const tracker = makeListSkillsTracker({ ok: true, value: skills });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ dryRun: true, include: ["deploy"] }));

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: ["deploy"],
        skipped: ["review"],
        dryRun: true,
      }),
      "skills",
    );
  });

  it("include that matches nothing results in empty written", async () => {
    const skills = [makeDiscoveredResource()];
    const tracker = makeListSkillsTracker({ ok: true, value: skills });
    mockBootstrap.mockResolvedValueOnce({ ok: true, value: { tracker, initMs: 5 } });

    await run(makeArgs({ include: ["nonexistent"] }));

    expect(mockFormatResult).toHaveBeenCalledWith(
      expect.objectContaining({
        written: [],
        skipped: ["deploy"],
        filter: expect.objectContaining({ filteredCount: 0 }) as unknown,
      }),
      "skills",
    );
  });
});
