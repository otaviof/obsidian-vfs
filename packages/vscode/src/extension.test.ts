import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock, fakeContext } from "./test-mocks.js";

vi.mock("vscode", () =>
  createVscodeMock({
    window: true,
    workspace: true,
    uri: true,
    eventEmitter: true,
    commands: true,
    languages: true,
    statusBar: true,
    treeView: true,
  }),
);

vi.mock("./bootstrap.js", () => ({
  bootstrapFromConfig: vi.fn(),
  readConfig: vi.fn().mockReturnValue({ cliPath: "obsidian", timeoutMs: 10_000, autoMount: [] }),
}));

vi.mock("./file-system-provider.js", () => ({
  ObsidianFileSystemProvider: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.watch = vi.fn(() => ({ dispose: vi.fn() }));
    this.dispose = vi.fn();
  }),
}));

vi.mock("./commands.js", () => ({
  registerCommands: vi.fn(),
}));

vi.mock("./vault-tree-provider.js", () => ({
  VaultTreeDataProvider: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.dispose = vi.fn();
    this.refresh = vi.fn();
  }),
}));

vi.mock("./status-bar.js", () => ({
  StatusBarManager: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.dispose = vi.fn();
  }),
}));

vi.mock("./wikilink-provider.js", () => ({
  WikilinkDocumentLinkProvider: vi.fn(),
}));

import * as vscode from "vscode";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { bootstrapFromConfig } from "./bootstrap.js";
import { registerCommands } from "./commands.js";
import { activate, deactivate } from "./extension.js";
import { ObsidianFileSystemProvider } from "./file-system-provider.js";
import { StatusBarManager } from "./status-bar.js";
import { VaultTreeDataProvider } from "./vault-tree-provider.js";
import { WikilinkDocumentLinkProvider } from "./wikilink-provider.js";

const mockBootstrap = vi.mocked(bootstrapFromConfig);

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
    await activate(ctx as never);

    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith("Obsidian VFS");
    expect(ctx.subscriptions.length).toBeGreaterThanOrEqual(1);
  });

  it("logs error and returns early on bootstrap failure", async () => {
    mockBootstrap.mockResolvedValueOnce({
      ok: false,
      error: { code: "VAULT_NOT_FOUND", message: "Vault not found" },
    });

    const ctx = fakeContext();
    await activate(ctx as never);

    const channel = vi.mocked(vscode.window.createOutputChannel).mock.results[0].value as {
      appendLine: ReturnType<typeof vi.fn>;
    };
    expect(channel.appendLine).toHaveBeenCalledWith(expect.stringContaining("bootstrap failed"));
    expect(ObsidianFileSystemProvider).not.toHaveBeenCalled();
    expect(registerCommands).not.toHaveBeenCalled();
    expect(VaultTreeDataProvider).not.toHaveBeenCalled();
    expect(StatusBarManager).not.toHaveBeenCalled();
  });

  it("wires all components on successful bootstrap", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    const ctx = fakeContext();
    await activate(ctx as never);

    expect(ObsidianFileSystemProvider).toHaveBeenCalledWith(fakeTracker);
    expect(vscode.workspace.registerFileSystemProvider).toHaveBeenCalledWith(
      "obs",
      expect.anything(),
      { isCaseSensitive: true, isReadonly: false },
    );
    expect(VaultTreeDataProvider).toHaveBeenCalledWith(fakeTracker);
    expect(vscode.window.createTreeView).toHaveBeenCalledWith("obsidianVFS", expect.anything());
    const treeView = vi.mocked(vscode.window.createTreeView).mock.results[0].value as {
      title: string;
    };
    expect(treeView.title).toBe("Obsidian: MyVault");
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "obsidianVFS.active",
      true,
    );
    expect(registerCommands).toHaveBeenCalledWith(
      ctx,
      fakeTracker,
      expect.anything(),
      expect.anything(),
    );
    expect(StatusBarManager).toHaveBeenCalledWith(fakeTracker);
    expect(WikilinkDocumentLinkProvider).toHaveBeenCalledWith(fakeTracker);
    expect(vscode.languages.registerDocumentLinkProvider).toHaveBeenCalledWith(
      { scheme: "obs", language: "markdown" },
      expect.anything(),
    );
  });
});

describe("deactivate", () => {
  it("is a no-op (cleanup via disposables)", () => {
    expect(() => deactivate()).not.toThrow();
  });
});
