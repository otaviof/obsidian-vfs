import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-mocks.js";

vi.mock("vscode", () =>
  createVscodeMock({ workspace: true, uri: true, configurationTarget: true, commands: true }),
);

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
}));

import fs from "node:fs";
import { readdir } from "node:fs/promises";
import * as vscode from "vscode";

import { SCHEME } from "./uri-adapter.js";
import {
  FOLDER_NAME_PREFIX,
  addVaultWorkspaceFolder,
  clearManagedExcludes,
  generateWorkspaceFile,
  hasVaultWorkspaceFolder,
  openWorkspaceFile,
  removeVaultWorkspaceFolders,
  syncFilesExclude,
} from "./workspace-folder.js";

interface FolderEntry {
  uri: { scheme: string; fsPath?: string };
  name: string;
  index: number;
}

const workspace = vscode.workspace as unknown as {
  workspaceFolders: FolderEntry[] | undefined;
  updateWorkspaceFolders: ReturnType<typeof vi.fn>;
  getConfiguration: ReturnType<typeof vi.fn>;
};

describe("hasVaultWorkspaceFolder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    workspace.workspaceFolders = undefined;
  });

  it("returns false when no workspace folders exist", () => {
    workspace.workspaceFolders = undefined;
    expect(hasVaultWorkspaceFolder("/vault")).toBe(false);
  });

  it("returns false when only unmanaged file:// folders exist", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];
    expect(hasVaultWorkspaceFolder("/vault")).toBe(false);
  });

  it("returns true when an obs:// folder exists", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: SCHEME }, name: `${FOLDER_NAME_PREFIX}MyVault`, index: 1 },
    ];
    expect(hasVaultWorkspaceFolder("/vault")).toBe(true);
  });

  it("returns true when a managed file:// folder at vault root exists", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      {
        uri: { scheme: "file", fsPath: "/vault" },
        name: `${FOLDER_NAME_PREFIX}MyVault`,
        index: 1,
      },
    ];
    expect(hasVaultWorkspaceFolder("/vault")).toBe(true);
  });

  it("returns true when a managed file:// folder under vault exists (backward compat)", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      {
        uri: { scheme: "file", fsPath: "/vault/Notes" },
        name: `${FOLDER_NAME_PREFIX}Notes`,
        index: 1,
      },
    ];
    expect(hasVaultWorkspaceFolder("/vault")).toBe(true);
  });

  it("returns false when file:// folder has matching path but no name prefix", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/vault/Notes" }, name: "Notes", index: 0 },
    ];
    expect(hasVaultWorkspaceFolder("/vault")).toBe(false);
  });

  it("returns false when file:// folder has matching name but different path", () => {
    workspace.workspaceFolders = [
      {
        uri: { scheme: "file", fsPath: "/other/Notes" },
        name: `${FOLDER_NAME_PREFIX}Notes`,
        index: 0,
      },
    ];
    expect(hasVaultWorkspaceFolder("/vault")).toBe(false);
  });

  it("returns false when file:// folder path is a prefix collision", () => {
    workspace.workspaceFolders = [
      {
        uri: { scheme: "file", fsPath: "/vault-other/Notes" },
        name: `${FOLDER_NAME_PREFIX}Notes`,
        index: 0,
      },
    ];
    expect(hasVaultWorkspaceFolder("/vault")).toBe(false);
  });
});

describe("addVaultWorkspaceFolder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    workspace.workspaceFolders = undefined;
  });

  it("returns already-present when obs:// folder exists", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: SCHEME }, name: `${FOLDER_NAME_PREFIX}MyVault`, index: 1 },
    ];

    const result = addVaultWorkspaceFolder("/vault", "MyVault");
    expect(result).toEqual({ status: "already-present" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("returns already-present when managed file:// folder exists (backward compat)", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      {
        uri: { scheme: "file", fsPath: "/vault/Notes" },
        name: `${FOLDER_NAME_PREFIX}Notes`,
        index: 1,
      },
    ];

    const result = addVaultWorkspaceFolder("/vault", "MyVault");
    expect(result).toEqual({ status: "already-present" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("returns skipped when no workspace folders exist", () => {
    workspace.workspaceFolders = undefined;

    const result = addVaultWorkspaceFolder("/vault", "MyVault");
    expect(result).toEqual({ status: "skipped", reason: "no local workspace folder open" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("returns skipped when only non-file:// folders exist", () => {
    workspace.workspaceFolders = [{ uri: { scheme: "untitled" }, name: "untitled", index: 0 }];

    const result = addVaultWorkspaceFolder("/vault", "MyVault");
    expect(result).toEqual({ status: "skipped", reason: "no local workspace folder open" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("adds a single file:// workspace folder at vault root", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    const result = addVaultWorkspaceFolder("/vault", "MyVault");
    expect(result).toEqual({ status: "added" });
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 0, {
      uri: expect.objectContaining({ scheme: "file", fsPath: "/vault" }) as unknown,
      name: `${FOLDER_NAME_PREFIX}MyVault`,
    });
  });

  it("appends at correct index when multiple file:// folders exist", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: "file", fsPath: "/projects/bar" }, name: "bar", index: 1 },
    ];

    const result = addVaultWorkspaceFolder("/vault", "MyVault");
    expect(result).toEqual({ status: "added" });
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(2, 0, {
      uri: expect.objectContaining({ scheme: "file", fsPath: "/vault" }) as unknown,
      name: `${FOLDER_NAME_PREFIX}MyVault`,
    });
  });

  it("returns skipped when workspace folders is empty array", () => {
    workspace.workspaceFolders = [];

    const result = addVaultWorkspaceFolder("/vault", "MyVault");
    expect(result).toEqual({ status: "skipped", reason: "no local workspace folder open" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });
});

describe("removeVaultWorkspaceFolders", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    workspace.workspaceFolders = undefined;
  });

  it("does nothing when no workspace folders exist", () => {
    workspace.workspaceFolders = undefined;
    removeVaultWorkspaceFolders("/vault");
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("removes obs:// folder", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: SCHEME }, name: `${FOLDER_NAME_PREFIX}MyVault`, index: 1 },
    ];

    removeVaultWorkspaceFolders("/vault");
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 1);
  });

  it("removes managed file:// folders (backward compat)", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      {
        uri: { scheme: "file", fsPath: "/vault/Notes" },
        name: `${FOLDER_NAME_PREFIX}Notes`,
        index: 1,
      },
    ];

    removeVaultWorkspaceFolders("/vault");
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 1);
  });

  it("removes multiple managed folders (backward compat)", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: SCHEME }, name: `${FOLDER_NAME_PREFIX}MyVault`, index: 1 },
      {
        uri: { scheme: "file", fsPath: "/vault/Notes" },
        name: `${FOLDER_NAME_PREFIX}Notes`,
        index: 2,
      },
    ];

    removeVaultWorkspaceFolders("/vault");
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledTimes(2);
    expect(workspace.updateWorkspaceFolders).toHaveBeenNthCalledWith(1, 2, 1);
    expect(workspace.updateWorkspaceFolders).toHaveBeenNthCalledWith(2, 1, 1);
  });

  it("does not remove unmanaged file:// folders", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    removeVaultWorkspaceFolders("/vault");
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("does not remove file:// folders outside vault path", () => {
    workspace.workspaceFolders = [
      {
        uri: { scheme: "file", fsPath: "/other/Notes" },
        name: `${FOLDER_NAME_PREFIX}Notes`,
        index: 0,
      },
    ];

    removeVaultWorkspaceFolders("/vault");
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("does not remove file:// folders with prefix-colliding path", () => {
    workspace.workspaceFolders = [
      {
        uri: { scheme: "file", fsPath: "/vault-other/Notes" },
        name: `${FOLDER_NAME_PREFIX}Notes`,
        index: 0,
      },
    ];

    removeVaultWorkspaceFolders("/vault");
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });
});

describe("syncFilesExclude", () => {
  let mockUpdate: ReturnType<typeof vi.fn>;
  let mockInspect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      {
        uri: { scheme: "file", fsPath: "/vault" },
        name: `${FOLDER_NAME_PREFIX}MyVault`,
        index: 1,
      },
    ];
    mockUpdate = vi.fn().mockResolvedValue(undefined);
    mockInspect = vi.fn(() => ({ workspaceFolderValue: {}, workspaceValue: undefined }));
    workspace.getConfiguration = vi.fn().mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
      inspect: mockInspect,
      update: mockUpdate,
    });
  });

  it("splits dotfiles to WorkspaceFolder and non-dotfiles to Workspace", async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      "Notes",
      ".obsidian",
      ".trash",
      "Private",
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await syncFilesExclude("/vault", ["Notes"], [], []);

    expect(result).toContain(".obsidian");
    expect(result).toContain(".trash");
    expect(result).toContain("Private");
    expect(result).not.toContain("Notes");
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({ ".obsidian": true, ".trash": true }),
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({ Private: true }),
      vscode.ConfigurationTarget.Workspace,
    );
  });

  it("skips .vscode from files.exclude patterns", async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      "Notes",
      ".vscode",
      ".obsidian",
      "Private",
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await syncFilesExclude("/vault", ["Notes"], [], []);

    expect(result).not.toContain(".vscode");
    const folderCall = mockUpdate.mock.calls.find(
      (c: unknown[]) => c[2] === vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(folderCall?.[1]).not.toHaveProperty(".vscode");
    const wsCall = mockUpdate.mock.calls.find(
      (c: unknown[]) => c[2] === vscode.ConfigurationTarget.Workspace,
    );
    expect(wsCall?.[1]).not.toHaveProperty(".vscode");
  });

  it("writes blocked paths to WorkspaceFolder tier", async () => {
    vi.mocked(readdir).mockResolvedValueOnce([
      "20-areas",
      "30-resources",
      "00-inbox",
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await syncFilesExclude(
      "/vault",
      ["20-areas", "30-resources"],
      ["20-areas/career", "30-resources/hardware"],
      [],
    );

    expect(result).toContain("00-inbox");
    expect(result).toContain("20-areas/career");
    expect(result).toContain("30-resources/hardware");
    expect(result).not.toContain("20-areas");
    expect(result).not.toContain("30-resources");
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({
        "20-areas/career": true,
        "30-resources/hardware": true,
      }),
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({ "00-inbox": true }),
      vscode.ConfigurationTarget.Workspace,
    );
  });

  it("adds blocked paths directly as folder-scoped exclude patterns", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", "Areas"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    const result = await syncFilesExclude("/vault", ["Notes", "Areas"], ["Areas/private"], []);

    expect(result).toContain("Areas/private");
    expect(result).not.toContain("Areas");
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({ "Areas/private": true }),
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
  });

  it("preserves autoMount entries with nested paths", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["docs", "Notes", ".obsidian"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    const result = await syncFilesExclude("/vault", ["docs/readme.md", "Notes"], [], []);

    expect(result).toContain(".obsidian");
    expect(result).not.toContain("docs");
    expect(result).not.toContain("Notes");
  });

  it("preserves existing folder-scoped patterns from user", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", ".obsidian"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    mockInspect.mockReturnValue({
      workspaceFolderValue: { "**/.git": true },
      workspaceValue: undefined,
    });

    const result = await syncFilesExclude("/vault", ["Notes"], [], []);

    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({ "**/.git": true, ".obsidian": true }),
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(result).toEqual([".obsidian"]);
  });

  it("removes stale managed patterns no longer needed", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", "Private"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    mockInspect.mockReturnValue({
      workspaceFolderValue: { ".OldDot": true },
      workspaceValue: { OldDir: true, Private: true },
    });

    const result = await syncFilesExclude("/vault", ["Notes"], [], [".OldDot", "OldDir", "Private"]);

    expect(result).toContain("Private");
    expect(result).not.toContain("OldDir");
    expect(result).not.toContain(".OldDot");
    const folderCall = mockUpdate.mock.calls.find(
      (c: unknown[]) => c[2] === vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(folderCall?.[1]).not.toHaveProperty(".OldDot");
    const wsCall = mockUpdate.mock.calls.find(
      (c: unknown[]) => c[2] === vscode.ConfigurationTarget.Workspace,
    );
    expect(wsCall?.[1]).toHaveProperty("Private");
    expect(wsCall?.[1]).not.toHaveProperty("OldDir");
  });

  it("returns empty array when all entries are autoMounted", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", "Projects"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    const result = await syncFilesExclude("/vault", ["Notes", "Projects"], [], []);

    expect(result).toEqual([]);
  });

  it("writes only workspace-scoped patterns when vault is not a workspace folder", async () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", ".obsidian", "Private"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    const result = await syncFilesExclude("/vault", ["Notes"], [], []);

    expect(result).toContain(".obsidian");
    expect(result).toContain("Private");
    expect(mockUpdate).not.toHaveBeenCalledWith(
      "exclude",
      expect.anything(),
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({ ".obsidian": true, Private: true }),
      vscode.ConfigurationTarget.Workspace,
    );
  });

  it("migrates dotfile patterns from workspace to folder scope", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", ".obsidian"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    mockInspect.mockReturnValue({
      workspaceFolderValue: {},
      workspaceValue: { ".obsidian": true, node_modules: true },
    });

    const result = await syncFilesExclude("/vault", ["Notes"], [], [".obsidian"]);

    expect(result).toContain(".obsidian");
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({ ".obsidian": true }),
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    // Migration: .obsidian removed from workspace level, node_modules preserved
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      { node_modules: true },
      vscode.ConfigurationTarget.Workspace,
    );
  });

  it("returns previouslyManaged when readdir fails", async () => {
    vi.mocked(readdir).mockRejectedValueOnce(new Error("EACCES: permission denied"));

    const result = await syncFilesExclude("/vault", ["Notes"], [], [".obsidian", "Private"]);

    expect(result).toEqual([".obsidian", "Private"]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("clearManagedExcludes", () => {
  let mockUpdate: ReturnType<typeof vi.fn>;
  let mockInspect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      {
        uri: { scheme: "file", fsPath: "/vault" },
        name: `${FOLDER_NAME_PREFIX}MyVault`,
        index: 1,
      },
    ];
    mockUpdate = vi.fn().mockResolvedValue(undefined);
    mockInspect = vi.fn(() => ({
      workspaceFolderValue: undefined,
      workspaceValue: undefined,
    }));
    workspace.getConfiguration = vi.fn().mockReturnValue({
      get: vi.fn((_key: string, _defaultValue: unknown) => _defaultValue),
      inspect: mockInspect,
      update: mockUpdate,
    });
  });

  it("removes managed patterns from folder-scoped files.exclude", async () => {
    mockInspect.mockReturnValue({
      workspaceFolderValue: { node_modules: true, ".obsidian": true, Private: true },
      workspaceValue: undefined,
    });

    await clearManagedExcludes("/vault", [".obsidian", "Private"]);

    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      { node_modules: true },
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
  });

  it("sets undefined when no folder-scoped patterns remain", async () => {
    mockInspect.mockReturnValue({
      workspaceFolderValue: { ".obsidian": true },
      workspaceValue: undefined,
    });

    await clearManagedExcludes("/vault", [".obsidian"]);

    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      undefined,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
  });

  it("does nothing when previouslyManaged is empty", async () => {
    await clearManagedExcludes("/vault", []);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("preserves user patterns when removing managed ones", async () => {
    mockInspect.mockReturnValue({
      workspaceFolderValue: { node_modules: true, ".git": true, ".obsidian": true },
      workspaceValue: undefined,
    });

    await clearManagedExcludes("/vault", [".obsidian"]);

    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      { node_modules: true, ".git": true },
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
  });

  it("cleans both folder-scoped and workspace-scoped patterns", async () => {
    mockInspect.mockReturnValue({
      workspaceFolderValue: { ".obsidian": true },
      workspaceValue: { ".obsidian": true, node_modules: true },
    });

    await clearManagedExcludes("/vault", [".obsidian"]);

    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      undefined,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      { node_modules: true },
      vscode.ConfigurationTarget.Workspace,
    );
  });
});

describe("generateWorkspaceFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    workspace.workspaceFolders = undefined;
  });

  it("creates workspace file with correct name and file:// vault entry", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/path/to/my-project" }, name: "my-project", index: 0 },
    ];
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = generateWorkspaceFile("/vault", "MyVault");

    expect(result.status).toBe("created");
    expect(result.fileUri.fsPath).toBe("/path/to/my-project/my-project.code-workspace");
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/path/to/my-project/my-project.code-workspace",
      expect.any(String),
    );
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string) as Record<
      string,
      unknown
    >;
    expect(written).toEqual({
      folders: [{ path: "." }, { path: "/vault", name: `${FOLDER_NAME_PREFIX}MyVault` }],
    });
  });

  it("carries .vscode/settings.json into the workspace file", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/path/to/my-project" }, name: "my-project", index: 0 },
    ];
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ "editor.fontSize": 14, "files.autoSave": "onFocusChange" }),
    );

    generateWorkspaceFile("/vault", "MyVault");

    expect(fs.readFileSync).toHaveBeenCalledWith(
      "/path/to/my-project/.vscode/settings.json",
      "utf-8",
    );
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string) as Record<
      string,
      unknown
    >;
    expect(written).toEqual({
      folders: [{ path: "." }, { path: "/vault", name: `${FOLDER_NAME_PREFIX}MyVault` }],
      settings: { "editor.fontSize": 14, "files.autoSave": "onFocusChange" },
    });
  });

  it("returns already-exists when file exists", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/path/to/my-project" }, name: "my-project", index: 0 },
    ];
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = generateWorkspaceFile("/vault", "MyVault");

    expect(result.status).toBe("already-exists");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("handles multiple local folders", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/path/to/my-project" }, name: "my-project", index: 0 },
      {
        uri: { scheme: "file", fsPath: "/path/to/my-project/packages/lib" },
        name: "lib",
        index: 1,
      },
    ];
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = generateWorkspaceFile("/vault", "MyVault");

    expect(result.status).toBe("created");
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string) as Record<
      string,
      unknown
    >;
    expect(written).toEqual({
      folders: [
        { path: "." },
        { path: "packages/lib" },
        { path: "/vault", name: `${FOLDER_NAME_PREFIX}MyVault` },
      ],
    });
  });

  it("uses absolute path for folders outside project root", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/path/to/my-project" }, name: "my-project", index: 0 },
      { uri: { scheme: "file", fsPath: "/other/location" }, name: "other", index: 1 },
    ];
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    generateWorkspaceFile("/vault", "MyVault");

    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string) as Record<
      string,
      unknown
    >;
    expect(written).toEqual({
      folders: [
        { path: "." },
        { path: "/other/location" },
        { path: "/vault", name: `${FOLDER_NAME_PREFIX}MyVault` },
      ],
    });
  });

  it("throws when no local folder open", () => {
    workspace.workspaceFolders = [];

    expect(() => generateWorkspaceFile("/vault", "MyVault")).toThrow(
      "No local workspace folder open",
    );
  });
});

describe("openWorkspaceFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("calls vscode.openFolder with the file URI", async () => {
    const fileUri = vscode.Uri.file("/project/project.code-workspace");

    await openWorkspaceFile(fileUri);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.openFolder", fileUri);
  });
});
