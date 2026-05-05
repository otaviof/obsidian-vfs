import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
    }),
  },
}));

vi.mock("@obsidian-vfs/core", () => ({
  DEFAULT_CLI_PATH: "obsidian",
  DEFAULT_TIMEOUT_MS: 10_000,
  bootstrapTracker: vi.fn(),
}));

import { bootstrapTracker } from "@obsidian-vfs/core";
import * as vscode from "vscode";

import { bootstrapFromConfig, readConfig } from "./bootstrap.js";

const mockBootstrap = vi.mocked(bootstrapTracker);

describe("readConfig", () => {
  it("returns defaults when no settings configured", () => {
    const config = readConfig();
    expect(config.cliPath).toBe("obsidian");
    expect(config.timeoutMs).toBe(10_000);
  });

  it("reads values from VSCode configuration", () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
      get: vi.fn((key: string) => {
        if (key === "cliPath") return "/usr/bin/obsidian";
        if (key === "timeoutMs") return 5000;
        return undefined;
      }),
    } as never);

    const config = readConfig();
    expect(config.cliPath).toBe("/usr/bin/obsidian");
    expect(config.timeoutMs).toBe(5000);
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
      cliPath: "obsidian",
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
