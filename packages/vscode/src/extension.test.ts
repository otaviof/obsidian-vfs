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
  readConfig: vi.fn().mockReturnValue({
    cliPath: "obsidian",
    timeoutMs: 10_000,
    autoMount: [],
    explorer: true,
    statusBar: true,
    workspace: true,
  }),
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
    this.show = vi.fn();
    this.hide = vi.fn();
    this.dispose = vi.fn();
  }),
}));

vi.mock("./wikilink-provider.js", () => ({
  WikilinkDocumentLinkProvider: vi.fn(),
}));

vi.mock("./workspace-folder.js", () => ({
  addVaultWorkspaceFolder: vi.fn().mockReturnValue({ status: "added" }),
  removeVaultWorkspaceFolders: vi.fn(),
}));

import * as vscode from "vscode";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { bootstrapFromConfig, readConfig } from "./bootstrap.js";
import { registerCommands } from "./commands.js";
import { activate, deactivate } from "./extension.js";
import { ObsidianFileSystemProvider } from "./file-system-provider.js";
import { StatusBarManager } from "./status-bar.js";
import { VaultTreeDataProvider } from "./vault-tree-provider.js";
import { WikilinkDocumentLinkProvider } from "./wikilink-provider.js";
import { addVaultWorkspaceFolder, removeVaultWorkspaceFolders } from "./workspace-folder.js";

const mockBootstrap = vi.mocked(bootstrapFromConfig);
const mockReadConfig = vi.mocked(readConfig);
const mockAddWF = vi.mocked(addVaultWorkspaceFolder);
const mockRemoveWF = vi.mocked(removeVaultWorkspaceFolders);

describe("activate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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

  it("adds workspace folder when workspace is true", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });
    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: true,
      workspace: true,
    });

    await activate(fakeContext() as never);

    expect(mockAddWF).toHaveBeenCalledWith("MyVault");
  });

  it("skips workspace folder when workspace is false", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });
    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: true,
      workspace: false,
    });

    await activate(fakeContext() as never);

    expect(mockAddWF).not.toHaveBeenCalled();
  });

  it("logs workspace folder result when workspace is true and added", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });
    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: true,
      workspace: true,
    });
    mockAddWF.mockReturnValueOnce({ status: "added" });

    await activate(fakeContext() as never);

    const channel = vi.mocked(vscode.window.createOutputChannel).mock.results[0].value as {
      appendLine: ReturnType<typeof vi.fn>;
    };
    expect(channel.appendLine).toHaveBeenCalledWith("Workspace folder: added");
  });

  it("logs workspace folder result when workspace is true and skipped", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });
    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: true,
      workspace: true,
    });
    mockAddWF.mockReturnValueOnce({ status: "skipped", reason: "no local workspace folder open" });

    await activate(fakeContext() as never);

    const channel = vi.mocked(vscode.window.createOutputChannel).mock.results[0].value as {
      appendLine: ReturnType<typeof vi.fn>;
    };
    expect(channel.appendLine).toHaveBeenCalledWith(
      "Workspace folder: skipped — no local workspace folder open",
    );
  });

  it("does not show status bar when statusBar is false", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });
    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: false,
      workspace: false,
    });

    await activate(fakeContext() as never);

    const statusBarInstance = vi.mocked(StatusBarManager).mock.results[0].value as {
      show: ReturnType<typeof vi.fn>;
    };
    expect(statusBarInstance.show).not.toHaveBeenCalled();
  });

  it("shows status bar when statusBar is true", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });
    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: true,
      workspace: false,
    });

    await activate(fakeContext() as never);

    const statusBarInstance = vi.mocked(StatusBarManager).mock.results[0].value as {
      show: ReturnType<typeof vi.fn>;
    };
    expect(statusBarInstance.show).toHaveBeenCalled();
  });

  it("does not set explorerEnabled context when explorer is false", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });
    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: false,
      statusBar: true,
      workspace: false,
    });

    await activate(fakeContext() as never);

    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    expect(executeCommand).toHaveBeenCalledWith("setContext", "obsidianVFS.active", true);
    expect(executeCommand).toHaveBeenCalledWith("setContext", "obsidianVFS.explorerEnabled", false);
  });

  it("sets explorerEnabled context when explorer is true", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });
    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: false,
      workspace: false,
    });

    await activate(fakeContext() as never);

    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    expect(executeCommand).toHaveBeenCalledWith("setContext", "obsidianVFS.active", true);
    expect(executeCommand).toHaveBeenCalledWith("setContext", "obsidianVFS.explorerEnabled", true);
  });
});

describe("configuration change listener", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("registers onDidChangeConfiguration listener", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    await activate(fakeContext() as never);

    expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
  });

  it("updates explorerEnabled context when explorer config changes to true", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    let configChangeListener:
      | ((e: { affectsConfiguration: (key: string) => boolean }) => void)
      | null = null;
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation((callback) => {
      configChangeListener = callback as typeof configChangeListener;
      return { dispose: vi.fn() };
    });

    await activate(fakeContext() as never);

    expect(configChangeListener).toBeTruthy();

    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: true,
      workspace: false,
    });

    configChangeListener!({ affectsConfiguration: (key) => key === "obsidianVFS.explorer" });

    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    expect(executeCommand).toHaveBeenCalledWith("setContext", "obsidianVFS.explorerEnabled", true);
  });

  it("updates explorerEnabled context when explorer config changes to false", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    let configChangeListener:
      | ((e: { affectsConfiguration: (key: string) => boolean }) => void)
      | null = null;
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation((callback) => {
      configChangeListener = callback as typeof configChangeListener;
      return { dispose: vi.fn() };
    });

    await activate(fakeContext() as never);

    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: false,
      statusBar: true,
      workspace: false,
    });

    configChangeListener!({ affectsConfiguration: (key) => key === "obsidianVFS.explorer" });

    const executeCommand = vi.mocked(vscode.commands.executeCommand);
    expect(executeCommand).toHaveBeenCalledWith("setContext", "obsidianVFS.explorerEnabled", false);
  });

  it("shows status bar when statusBar config changes to true", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    let configChangeListener:
      | ((e: { affectsConfiguration: (key: string) => boolean }) => void)
      | null = null;
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation((callback) => {
      configChangeListener = callback as typeof configChangeListener;
      return { dispose: vi.fn() };
    });

    await activate(fakeContext() as never);

    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: true,
      workspace: false,
    });

    configChangeListener!({ affectsConfiguration: (key) => key === "obsidianVFS.statusBar" });

    const statusBarInstance = vi.mocked(StatusBarManager).mock.results[0].value as {
      show: ReturnType<typeof vi.fn>;
      hide: ReturnType<typeof vi.fn>;
    };
    expect(statusBarInstance.show).toHaveBeenCalled();
  });

  it("hides status bar when statusBar config changes to false", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    let configChangeListener:
      | ((e: { affectsConfiguration: (key: string) => boolean }) => void)
      | null = null;
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation((callback) => {
      configChangeListener = callback as typeof configChangeListener;
      return { dispose: vi.fn() };
    });

    await activate(fakeContext() as never);

    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: false,
      workspace: false,
    });

    configChangeListener!({ affectsConfiguration: (key) => key === "obsidianVFS.statusBar" });

    const statusBarInstance = vi.mocked(StatusBarManager).mock.results[0].value as {
      show: ReturnType<typeof vi.fn>;
      hide: ReturnType<typeof vi.fn>;
    };
    expect(statusBarInstance.hide).toHaveBeenCalled();
  });

  it("adds workspace folder when workspace config changes to true", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    let configChangeListener:
      | ((e: { affectsConfiguration: (key: string) => boolean }) => void)
      | null = null;
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation((callback) => {
      configChangeListener = callback as typeof configChangeListener;
      return { dispose: vi.fn() };
    });

    await activate(fakeContext() as never);

    vi.clearAllMocks();

    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: true,
      workspace: true,
    });
    mockAddWF.mockReturnValueOnce({ status: "added" });

    configChangeListener!({ affectsConfiguration: (key) => key === "obsidianVFS.workspace" });

    expect(mockAddWF).toHaveBeenCalledWith("MyVault");
  });

  it("removes workspace folders when workspace config changes to false", async () => {
    const fakeTracker = {
      context: { name: "MyVault", physicalPath: "/vault", mode: "full" },
    } as unknown as LocalIndexTracker;

    mockBootstrap.mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    let configChangeListener:
      | ((e: { affectsConfiguration: (key: string) => boolean }) => void)
      | null = null;
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation((callback) => {
      configChangeListener = callback as typeof configChangeListener;
      return { dispose: vi.fn() };
    });

    await activate(fakeContext() as never);

    mockReadConfig.mockReturnValueOnce({
      cliPath: "obsidian",
      timeoutMs: 10_000,
      autoMount: [],
      explorer: true,
      statusBar: true,
      workspace: false,
    });

    configChangeListener!({ affectsConfiguration: (key) => key === "obsidianVFS.workspace" });

    expect(mockRemoveWF).toHaveBeenCalled();
  });
});

describe("deactivate", () => {
  it("is a no-op (cleanup via disposables)", () => {
    expect(() => deactivate()).not.toThrow();
  });
});
