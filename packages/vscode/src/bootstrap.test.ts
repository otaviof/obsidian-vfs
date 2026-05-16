import { describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-helpers.js";

vi.mock("vscode", () => createVscodeMock({ workspace: true }));

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    bootstrapTracker: vi.fn(),
  };
});

import { bootstrapTracker, resolveCliPath } from "@obsidian-vfs/core";
import * as vscode from "vscode";

import { bootstrapFromConfig, readConfig } from "./bootstrap.js";

const mockBootstrap = vi.mocked(bootstrapTracker);

describe("readConfig", () => {
  it("returns defaults when no settings configured", () => {
    const config = readConfig();
    expect(config.cliPath).toBe(resolveCliPath());
    expect(config.timeoutMs).toBe(10_000);
    expect(config.autoMount).toEqual([]);
  });

  it("reads values from VSCode configuration", () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
      get: vi.fn((key: string) => {
        if (key === "cliPath") return "/usr/bin/obsidian";
        if (key === "timeoutMs") return 5000;
        if (key === "autoMount") return ["10-projects", "20-areas"];
        return undefined;
      }),
    } as never);

    const config = readConfig();
    expect(config.cliPath).toBe("/usr/bin/obsidian");
    expect(config.timeoutMs).toBe(5000);
    expect(config.autoMount).toEqual(["10-projects", "20-areas"]);
  });
});

describe("bootstrapFromConfig", () => {
  it("delegates to core bootstrapTracker with config", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: {} as never, initMs: 42 },
    });

    const result = await bootstrapFromConfig();

    expect(mockBootstrap).toHaveBeenCalledWith({
      cliPath: resolveCliPath(),
      timeoutMs: 10_000,
    });
    expect(result.ok).toBe(true);
  });

  it("propagates bootstrap errors", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "CLI_UNAVAILABLE", message: "not found" },
    });

    const result = await bootstrapFromConfig();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CLI_UNAVAILABLE");
    }
  });
});
