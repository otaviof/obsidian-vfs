import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  const outputChannel = {
    appendLine: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    window: { createOutputChannel: vi.fn(() => outputChannel) },
    workspace: { registerFileSystemProvider: vi.fn(() => ({ dispose: vi.fn() })) },
    Uri: {
      from: vi.fn((c: { scheme: string; path: string }) => ({
        scheme: c.scheme,
        path: c.path,
      })),
    },
    EventEmitter: class {
      #listeners: ((e: unknown) => void)[] = [];
      event = (listener: (e: unknown) => void) => {
        this.#listeners.push(listener);
        return { dispose: () => undefined };
      };
      fire = (data: unknown) => this.#listeners.forEach((l) => l(data));
      dispose = vi.fn();
    },
  };
});

vi.mock("./bootstrap.js", () => ({
  bootstrapFromConfig: vi.fn(),
}));

vi.mock("./file-system-provider.js", () => ({
  ObsidianFileSystemProvider: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.watch = vi.fn(() => ({ dispose: vi.fn() }));
    this.dispose = vi.fn();
  }),
}));

import * as vscode from "vscode";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { bootstrapFromConfig } from "./bootstrap.js";
import { ObsidianFileSystemProvider } from "./file-system-provider.js";
import { activate, deactivate } from "./extension.js";

const mockBootstrap = vi.mocked(bootstrapFromConfig);

function fakeContext(): vscode.ExtensionContext {
  return { subscriptions: [] } as unknown as vscode.ExtensionContext;
}

describe("activate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an output channel and pushes it to subscriptions", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "CLI_UNAVAILABLE", message: "not found" },
    });

    const ctx = fakeContext();
    await activate(ctx);

    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith("Obsidian VFS");
    expect(ctx.subscriptions.length).toBeGreaterThanOrEqual(1);
  });

  it("logs error and returns early on bootstrap failure", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "VAULT_NOT_FOUND", message: "Vault not found" },
    });

    const ctx = fakeContext();
    await activate(ctx);

    const channel = vi.mocked(vscode.window.createOutputChannel).mock.results[0].value as {
      appendLine: ReturnType<typeof vi.fn>;
    };
    expect(channel.appendLine).toHaveBeenCalledWith(expect.stringContaining("bootstrap failed"));
    expect(ObsidianFileSystemProvider).not.toHaveBeenCalled();
  });

  it("registers provider and watcher on success", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    const ctx = fakeContext();
    await activate(ctx);

    const channel = vi.mocked(vscode.window.createOutputChannel).mock.results[0].value as {
      appendLine: ReturnType<typeof vi.fn>;
    };
    expect(channel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('vault "MyVault" loaded in 42ms'),
    );
    expect(ObsidianFileSystemProvider).toHaveBeenCalledWith(fakeTracker);
    expect(vscode.workspace.registerFileSystemProvider).toHaveBeenCalledWith(
      "obs",
      expect.anything(),
      { isCaseSensitive: true, isReadonly: false },
    );
    // output channel + provider + registration + watcher = 4
    expect(ctx.subscriptions).toHaveLength(4);
  });
});

describe("deactivate", () => {
  it("is a no-op (cleanup via disposables)", () => {
    expect(() => deactivate()).not.toThrow();
  });
});
