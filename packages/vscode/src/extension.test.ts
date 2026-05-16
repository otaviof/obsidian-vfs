import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock, fakeContext } from "./test-helpers.js";

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
  readConfig: vi.fn().mockReturnValue(fakeConfig()),
}));

vi.mock("./file-system-provider.js", () => ({
  ObsidianFileSystemProvider: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.watch = vi.fn(() => ({ dispose: vi.fn() }));
    this.dispose = vi.fn();
    this.setAutoMount = vi.fn();
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

vi.mock("./tree-drag-drop.js", () => ({
  VaultTreeDragAndDropController: vi.fn(),
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

vi.mock("./workspace-folder.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    FOLDER_NAME_PREFIX: (actual as Record<string, unknown>).FOLDER_NAME_PREFIX,
    addVaultWorkspaceFolder: vi.fn().mockReturnValue({ status: "added" }),
    removeVaultWorkspaceFolders: vi.fn(),
    hasVaultWorkspaceFolder: vi.fn(),
    excludeVaultFromGitDetection: vi.fn().mockResolvedValue(undefined),
    includeVaultInGitDetection: vi.fn().mockResolvedValue(undefined),
    syncFilesExclude: vi.fn().mockResolvedValue([]),
    clearManagedExcludes: vi.fn().mockResolvedValue(undefined),
    generateWorkspaceFile: vi.fn().mockReturnValue({
      status: "created",
      fileUri: { fsPath: "/project/project.code-workspace" },
    }),
    openWorkspaceFile: vi.fn().mockResolvedValue(undefined),
  };
});

import * as vscode from "vscode";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { bootstrapFromConfig, readConfig } from "./bootstrap.js";
import { registerCommands } from "./commands.js";
import { activate, deactivate } from "./extension.js";
import type { ExtensionConfig } from "./types.js";
import { CONFIG_KEY } from "./types.js";
import { SCHEME } from "./uri-adapter.js";
import { FOLDER_NAME_PREFIX } from "./workspace-folder.js";
import { ObsidianFileSystemProvider } from "./file-system-provider.js";
import { StatusBarManager } from "./status-bar.js";
import { VaultTreeDataProvider } from "./vault-tree-provider.js";
import { VaultTreeDragAndDropController } from "./tree-drag-drop.js";
import { WikilinkDocumentLinkProvider } from "./wikilink-provider.js";
import {
  addVaultWorkspaceFolder,
  clearManagedExcludes,
  excludeVaultFromGitDetection,
  generateWorkspaceFile,
  hasVaultWorkspaceFolder,
  includeVaultInGitDetection,
  openWorkspaceFile,
  removeVaultWorkspaceFolders,
  syncFilesExclude,
} from "./workspace-folder.js";

const mockBootstrap = vi.mocked(bootstrapFromConfig);
const mockReadConfig = vi.mocked(readConfig);
const mockAddWF = vi.mocked(addVaultWorkspaceFolder);
const mockRemoveWF = vi.mocked(removeVaultWorkspaceFolders);
const mockHasWF = vi.mocked(hasVaultWorkspaceFolder);
const mockExcludeGit = vi.mocked(excludeVaultFromGitDetection);
const mockIncludeGit = vi.mocked(includeVaultInGitDetection);
const mockSyncExclude = vi.mocked(syncFilesExclude);
const mockClearExclude = vi.mocked(clearManagedExcludes);
const mockGenerateWF = vi.mocked(generateWorkspaceFile);
const mockOpenWF = vi.mocked(openWorkspaceFile);

function fakeConfig(overrides?: Partial<ExtensionConfig>): ExtensionConfig {
  return {
    cliPath: "obsidian",
    timeoutMs: 10_000,
    autoMount: [],
    explorer: true,
    statusBar: true,
    workspace: true,
    workspaceFile: false,
    ...overrides,
  };
}

function trackerFixture() {
  return {
    context: {
      name: "MyVault",
      physicalPath: "/vault",
      mode: "full",
      vfsConfig: { agents: [], skills: [], allowed: [], blocked: [] },
    },
  } as unknown as LocalIndexTracker;
}

function bootstrapOk(tracker?: LocalIndexTracker) {
  mockBootstrap.mockResolvedValueOnce({
    ok: true,
    value: { tracker: tracker ?? trackerFixture(), initMs: 42 },
  });
}

type ConfigChangeListener = (e: { affectsConfiguration: (key: string) => boolean }) => void;

interface SetupResult {
  listener: ConfigChangeListener;
  treeProvider: { enabled: boolean; refresh: ReturnType<typeof vi.fn> };
  statusBar: { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };
  provider: { setAutoMount: ReturnType<typeof vi.fn> };
}

async function setupConfigListener(): Promise<SetupResult> {
  let listener: ConfigChangeListener | null = null;
  vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation((callback) => {
    listener = callback as ConfigChangeListener;
    return { dispose: vi.fn() };
  });
  bootstrapOk();
  await activate(fakeContext() as never);
  const result: SetupResult = {
    listener: listener!,
    treeProvider: vi.mocked(VaultTreeDataProvider).mock.results[0]
      .value as SetupResult["treeProvider"],
    statusBar: vi.mocked(StatusBarManager).mock.results[0].value as SetupResult["statusBar"],
    provider: vi.mocked(ObsidianFileSystemProvider).mock.results[0].value as SetupResult["provider"],
  };
  vi.clearAllMocks();
  return result;
}

function fireConfigChange(setup: SetupResult, ...keys: string[]): void {
  setup.listener({ affectsConfiguration: (key) => keys.includes(key) });
}

const workspace = vscode.workspace as unknown as {
  workspaceFile: { scheme: string } | undefined;
};

describe("activate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    workspace.workspaceFile = undefined;
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
    const tracker = trackerFixture();
    bootstrapOk(tracker);

    const ctx = fakeContext();
    await activate(ctx as never);

    expect(ObsidianFileSystemProvider).toHaveBeenCalledWith(tracker, []);
    expect(vscode.workspace.registerFileSystemProvider).toHaveBeenCalledWith(
      SCHEME,
      expect.anything(),
      { isCaseSensitive: true, isReadonly: false },
    );
    expect(VaultTreeDataProvider).toHaveBeenCalledWith(tracker);
    expect(VaultTreeDragAndDropController).toHaveBeenCalledWith("MyVault");
    expect(vscode.window.createTreeView).toHaveBeenCalledWith(
      "obsidianVFS",
      expect.objectContaining({ dragAndDropController: expect.anything() }),
    );
    const treeView = vi.mocked(vscode.window.createTreeView).mock.results[0].value as {
      title: string;
    };
    expect(treeView.title).toBe(`${FOLDER_NAME_PREFIX}MyVault`);
    expect(registerCommands).toHaveBeenCalledWith(
      ctx,
      tracker,
      expect.anything(),
      expect.anything(),
    );
    expect(StatusBarManager).toHaveBeenCalledWith(tracker);
    expect(WikilinkDocumentLinkProvider).toHaveBeenCalledWith(tracker);
    expect(vscode.languages.registerDocumentLinkProvider).toHaveBeenCalledWith(
      [
        { scheme: SCHEME, language: "markdown" },
        { scheme: "file", language: "markdown" },
      ],
      expect.anything(),
    );
  });

  it("adds workspace folder and syncs excludes when workspace is true with autoMount", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ autoMount: ["Notes"] }));
    mockSyncExclude.mockResolvedValueOnce([".obsidian", ".trash"]);

    const ctx = fakeContext();
    await activate(ctx as never);

    expect(mockAddWF).toHaveBeenCalledWith("/vault", "MyVault");
    expect(mockExcludeGit).toHaveBeenCalledWith("/vault");
    expect(mockSyncExclude).toHaveBeenCalledWith("/vault", ["Notes"], [], []);
    expect(ctx.workspaceState.get("managedFilesExclude")).toEqual([".obsidian", ".trash"]);
  });

  it("skips workspace folder when workspace is false", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspace: false }));

    await activate(fakeContext() as never);

    expect(mockAddWF).not.toHaveBeenCalled();
    expect(mockSyncExclude).not.toHaveBeenCalled();
  });

  it("skips workspace folder when autoMount is empty", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig());

    await activate(fakeContext() as never);

    expect(mockAddWF).not.toHaveBeenCalled();
    expect(mockSyncExclude).not.toHaveBeenCalled();
  });

  it("logs workspace folder result when workspace is true and added", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ autoMount: ["Notes"] }));
    mockAddWF.mockReturnValueOnce({ status: "added" });

    await activate(fakeContext() as never);

    const channel = vi.mocked(vscode.window.createOutputChannel).mock.results[0].value as {
      appendLine: ReturnType<typeof vi.fn>;
    };
    expect(channel.appendLine).toHaveBeenCalledWith("Workspace folder: added");
  });

  it("logs workspace folder result when workspace is true and skipped", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ autoMount: ["Notes"] }));
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
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ statusBar: false, workspace: false }));

    await activate(fakeContext() as never);

    const statusBarInstance = vi.mocked(StatusBarManager).mock.results[0].value as {
      show: ReturnType<typeof vi.fn>;
    };
    expect(statusBarInstance.show).not.toHaveBeenCalled();
  });

  it("shows status bar when statusBar is true", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspace: false }));

    await activate(fakeContext() as never);

    const statusBarInstance = vi.mocked(StatusBarManager).mock.results[0].value as {
      show: ReturnType<typeof vi.fn>;
    };
    expect(statusBarInstance.show).toHaveBeenCalled();
  });

  it("refreshes tree provider when view becomes visible", async () => {
    bootstrapOk();

    await activate(fakeContext() as never);

    const treeView = vi.mocked(vscode.window.createTreeView).mock.results[0].value as {
      onDidChangeVisibility: ReturnType<typeof vi.fn>;
    };
    expect(treeView.onDidChangeVisibility).toHaveBeenCalledWith(expect.any(Function));

    const treeProviderInstance = vi.mocked(VaultTreeDataProvider).mock.results[0].value as {
      refresh: ReturnType<typeof vi.fn>;
    };

    const visibilityCallback = treeView.onDidChangeVisibility.mock.calls[0][0] as (e: {
      visible: boolean;
    }) => void;

    visibilityCallback({ visible: true });
    expect(treeProviderInstance.refresh).toHaveBeenCalled();

    treeProviderInstance.refresh.mockClear();
    visibilityCallback({ visible: false });
    expect(treeProviderInstance.refresh).not.toHaveBeenCalled();
  });

  it("disables tree provider when explorer is false", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ explorer: false, workspace: false }));

    await activate(fakeContext() as never);

    const treeProviderInstance = vi.mocked(VaultTreeDataProvider).mock.results[0].value as {
      enabled: boolean;
    };
    expect(treeProviderInstance.enabled).toBe(false);
  });

  it("keeps tree provider enabled when explorer is true", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ statusBar: false, workspace: false }));

    await activate(fakeContext() as never);

    const treeProviderInstance = vi.mocked(VaultTreeDataProvider).mock.results[0].value as {
      enabled: boolean;
    };
    expect(treeProviderInstance.enabled).toBe(true);
  });
});

describe("workspace file activation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    workspace.workspaceFile = undefined;
  });

  it("prompts when workspaceFile is true and no saved workspace", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true, autoMount: ["Notes"] }));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Not Now" as never);

    await activate(fakeContext() as never);

    expect(mockGenerateWF).toHaveBeenCalledWith("/vault", "MyVault");
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });

  it("prompts when in an untitled workspace", async () => {
    workspace.workspaceFile = { scheme: "untitled" };
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true, autoMount: ["Notes"] }));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Not Now" as never);

    await activate(fakeContext() as never);

    expect(mockGenerateWF).toHaveBeenCalledWith("/vault", "MyVault");
  });

  it("skips generation when already in a saved workspace", async () => {
    workspace.workspaceFile = { scheme: "file" };
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true, autoMount: ["Notes"] }));

    await activate(fakeContext() as never);

    expect(mockGenerateWF).not.toHaveBeenCalled();
    expect(mockSyncExclude).toHaveBeenCalled();
    expect(mockExcludeGit).toHaveBeenCalled();
  });

  it("opens workspace file when user confirms", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true, autoMount: ["Notes"] }));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Open" as never);

    await activate(fakeContext() as never);

    expect(mockOpenWF).toHaveBeenCalled();
  });

  it("falls through to workspace folder when user declines", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true, autoMount: ["Notes"] }));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Not Now" as never);

    await activate(fakeContext() as never);

    expect(mockAddWF).toHaveBeenCalledWith("/vault", "MyVault");
    expect(mockSyncExclude).toHaveBeenCalled();
    expect(mockExcludeGit).toHaveBeenCalled();
  });

  it("logs and continues when no local folder open", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true, autoMount: ["Notes"] }));
    mockGenerateWF.mockImplementationOnce(() => {
      throw new Error("No local workspace folder open");
    });

    await activate(fakeContext() as never);

    const channel = vi.mocked(vscode.window.createOutputChannel).mock.results[0].value as {
      appendLine: ReturnType<typeof vi.fn>;
    };
    expect(channel.appendLine).toHaveBeenCalledWith(
      "Workspace file: skipped — No local workspace folder open",
    );
  });

  it("workspaceFile takes precedence over workspace", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(
      fakeConfig({ workspaceFile: true, workspace: true, autoMount: ["Notes"] }),
    );
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Not Now" as never);

    await activate(fakeContext() as never);

    expect(mockGenerateWF).toHaveBeenCalled();
  });

  it("workspace runs when workspaceFile is false", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspace: true, autoMount: ["Notes"] }));

    await activate(fakeContext() as never);

    expect(mockAddWF).toHaveBeenCalled();
    expect(mockSyncExclude).toHaveBeenCalled();
    expect(mockGenerateWF).not.toHaveBeenCalled();
  });

  it("excludes vault from git and syncs excludes when workspaceFile is true and already saved", async () => {
    workspace.workspaceFile = { scheme: "file" };
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true, autoMount: ["Notes"] }));

    await activate(fakeContext() as never);

    expect(mockExcludeGit).toHaveBeenCalledWith("/vault");
    expect(mockSyncExclude).toHaveBeenCalled();
    expect(mockGenerateWF).not.toHaveBeenCalled();
    expect(mockAddWF).not.toHaveBeenCalled();
  });

  it("skips all workspace logic when workspaceFile is true but autoMount is empty", async () => {
    bootstrapOk();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true }));

    await activate(fakeContext() as never);

    expect(mockGenerateWF).not.toHaveBeenCalled();
    expect(mockAddWF).not.toHaveBeenCalled();
  });
});

describe("configuration change listener", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    workspace.workspaceFile = undefined;
  });

  it("registers onDidChangeConfiguration listener", async () => {
    bootstrapOk();
    await activate(fakeContext() as never);

    expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
  });

  it("enables tree provider when explorer config changes to true", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspace: false }));

    fireConfigChange(setup, CONFIG_KEY.explorer);

    expect(setup.treeProvider.enabled).toBe(true);
  });

  it("disables tree provider when explorer config changes to false", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ explorer: false, workspace: false }));

    fireConfigChange(setup, CONFIG_KEY.explorer);

    expect(setup.treeProvider.enabled).toBe(false);
  });

  it("shows status bar when statusBar config changes to true", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspace: false }));

    fireConfigChange(setup, CONFIG_KEY.statusBar);

    expect(setup.statusBar.show).toHaveBeenCalled();
  });

  it("hides status bar when statusBar config changes to false", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ statusBar: false, workspace: false }));

    fireConfigChange(setup, CONFIG_KEY.statusBar);

    expect(setup.statusBar.hide).toHaveBeenCalled();
  });

  it("adds workspace folder and syncs excludes when workspace config changes to true", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ autoMount: ["Notes"] }));
    mockAddWF.mockReturnValueOnce({ status: "added" });
    mockSyncExclude.mockResolvedValueOnce([".obsidian"]);

    fireConfigChange(setup, CONFIG_KEY.workspace);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockRemoveWF).toHaveBeenCalledWith("/vault");
    expect(mockAddWF).toHaveBeenCalledWith("/vault", "MyVault");
    expect(mockExcludeGit).toHaveBeenCalledWith("/vault");
    expect(mockSyncExclude).toHaveBeenCalledWith("/vault", ["Notes"], [], []);
  });

  it("clears excludes and removes workspace folders when workspace config changes to false", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspace: false }));

    fireConfigChange(setup, CONFIG_KEY.workspace);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockRemoveWF).toHaveBeenCalledWith("/vault");
    expect(mockAddWF).not.toHaveBeenCalled();
    expect(mockClearExclude).toHaveBeenCalledWith("/vault", []);
    expect(mockIncludeGit).toHaveBeenCalledWith("/vault");
  });

  it("syncs excludes when autoMount changes without workspace toggle", async () => {
    const setup = await setupConfigListener();

    mockHasWF.mockReturnValueOnce(true);
    mockReadConfig.mockReturnValueOnce(fakeConfig({ autoMount: ["Notes", "Projects"] }));
    mockSyncExclude.mockResolvedValueOnce([".obsidian"]);

    fireConfigChange(setup, CONFIG_KEY.autoMount);
    await new Promise((r) => setTimeout(r, 0));

    expect(setup.provider.setAutoMount).toHaveBeenCalledWith(["Notes", "Projects"]);
    expect(mockRemoveWF).not.toHaveBeenCalled();
    expect(mockAddWF).not.toHaveBeenCalled();
    expect(mockSyncExclude).toHaveBeenCalledWith("/vault", ["Notes", "Projects"], [], []);
  });

  it("adds workspace folder when autoMount goes from empty to non-empty", async () => {
    const setup = await setupConfigListener();
    mockHasWF.mockReturnValueOnce(false);
    mockAddWF.mockReturnValueOnce({ status: "added" });
    mockSyncExclude.mockResolvedValueOnce([".obsidian"]);
    mockReadConfig.mockReturnValueOnce(fakeConfig({ autoMount: ["Notes"] }));

    fireConfigChange(setup, CONFIG_KEY.autoMount);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockAddWF).toHaveBeenCalledWith("/vault", "MyVault");
    expect(mockExcludeGit).toHaveBeenCalledWith("/vault");
    expect(mockSyncExclude).toHaveBeenCalledWith("/vault", ["Notes"], [], []);
    expect(mockRemoveWF).not.toHaveBeenCalled();
  });

  it("removes workspace folder and clears excludes when autoMount becomes empty", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(fakeConfig());

    fireConfigChange(setup, CONFIG_KEY.autoMount);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockRemoveWF).toHaveBeenCalledWith("/vault");
    expect(mockClearExclude).toHaveBeenCalledWith("/vault", []);
    expect(mockAddWF).not.toHaveBeenCalled();
  });

  it("config change triggers workspace file creation", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true, autoMount: ["Notes"] }));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Not Now" as never);

    fireConfigChange(setup, CONFIG_KEY.workspaceFile);

    expect(mockGenerateWF).toHaveBeenCalled();
  });

  it("config change opens workspace file when user confirms", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(fakeConfig({ workspaceFile: true, autoMount: ["Notes"] }));
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Open" as never);

    fireConfigChange(setup, CONFIG_KEY.workspaceFile);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockGenerateWF).toHaveBeenCalled();
    expect(mockOpenWF).toHaveBeenCalled();
  });

  it("syncs excludes when autoMount changes with workspaceFile active", async () => {
    const setup = await setupConfigListener();
    mockHasWF.mockReturnValueOnce(true);
    mockReadConfig.mockReturnValueOnce(
      fakeConfig({ workspace: false, workspaceFile: true, autoMount: ["Notes"] }),
    );
    mockSyncExclude.mockResolvedValueOnce([".obsidian"]);

    fireConfigChange(setup, CONFIG_KEY.autoMount);
    await new Promise((r) => setTimeout(r, 0));

    expect(setup.provider.setAutoMount).toHaveBeenCalledWith(["Notes"]);
    expect(mockSyncExclude).toHaveBeenCalledWith("/vault", ["Notes"], [], []);
  });

  it("config change for workspace skipped when workspaceFile is true", async () => {
    const setup = await setupConfigListener();
    mockReadConfig.mockReturnValueOnce(
      fakeConfig({ workspace: true, workspaceFile: true, autoMount: ["Notes"] }),
    );

    fireConfigChange(setup, CONFIG_KEY.workspace);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockAddWF).not.toHaveBeenCalled();
    expect(mockRemoveWF).not.toHaveBeenCalled();
  });
});

describe("deactivate", () => {
  it("is a no-op (cleanup via disposables)", () => {
    expect(() => deactivate()).not.toThrow();
  });
});
