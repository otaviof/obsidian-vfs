import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-mocks.js";

vi.mock("vscode", () => createVscodeMock({ workspace: true, uri: true, configurationTarget: true }));

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
}));

import { readdir } from "node:fs/promises";
import * as vscode from "vscode";

import { SCHEME } from "./uri-adapter.js";
import {
  FOLDER_NAME_PREFIX,
  addVaultWorkspaceFolder,
  clearManagedExcludes,
  hasVaultWorkspaceFolder,
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
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockUpdate = vi.fn().mockResolvedValue(undefined);
    mockGet = vi.fn((_key: string, defaultValue: unknown) => defaultValue);
    workspace.getConfiguration = vi.fn().mockReturnValue({
      get: mockGet,
      update: mockUpdate,
    });
  });

  it("excludes non-autoMount entries including dotfiles individually", async () => {
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
      expect.objectContaining({ ".obsidian": true, ".trash": true, Private: true }),
      vscode.ConfigurationTarget.Workspace,
    );
  });

  it("does not exclude autoMount entries when blocked sub-paths exist", async () => {
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
  });

  it("adds blocked paths directly as exclude patterns", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", "Areas"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    const result = await syncFilesExclude("/vault", ["Notes", "Areas"], ["Areas/private"], []);

    expect(result).toContain("Areas/private");
    expect(result).not.toContain("Areas");
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

  it("preserves user-set files.exclude patterns", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", ".obsidian"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    mockGet.mockImplementation((_key: string, _defaultValue: unknown) => ({
      node_modules: true,
      "**/.git": true,
    }));

    const result = await syncFilesExclude("/vault", ["Notes"], [], []);

    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({
        node_modules: true,
        "**/.git": true,
        ".obsidian": true,
      }),
      vscode.ConfigurationTarget.Workspace,
    );
    expect(result).toEqual([".obsidian"]);
  });

  it("removes stale managed patterns no longer needed", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", "Private"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    mockGet.mockImplementation((_key: string, _defaultValue: unknown) => ({
      OldDir: true,
      Private: true,
    }));

    const result = await syncFilesExclude("/vault", ["Notes"], [], ["OldDir", "Private"]);

    expect(result).toContain("Private");
    expect(result).not.toContain("OldDir");
    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      expect.objectContaining({ Private: true }),
      vscode.ConfigurationTarget.Workspace,
    );
    const updatedArg = mockUpdate.mock.calls[0][1] as Record<string, boolean>;
    expect(updatedArg).not.toHaveProperty("OldDir");
  });

  it("returns empty array when all entries are autoMounted", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["Notes", "Projects"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    const result = await syncFilesExclude("/vault", ["Notes", "Projects"], [], []);

    expect(result).toEqual([]);
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
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockUpdate = vi.fn().mockResolvedValue(undefined);
    mockGet = vi.fn((_key: string, _defaultValue: unknown) => _defaultValue);
    workspace.getConfiguration = vi.fn().mockReturnValue({
      get: mockGet,
      update: mockUpdate,
    });
  });

  it("removes managed patterns from files.exclude", async () => {
    mockGet.mockImplementation((_key: string, _defaultValue: unknown) => ({
      node_modules: true,
      ".obsidian": true,
      Private: true,
    }));

    await clearManagedExcludes([".obsidian", "Private"]);

    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      { node_modules: true },
      vscode.ConfigurationTarget.Workspace,
    );
  });

  it("sets undefined when no patterns remain", async () => {
    mockGet.mockImplementation((_key: string, _defaultValue: unknown) => ({
      ".obsidian": true,
    }));

    await clearManagedExcludes([".obsidian"]);

    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      undefined,
      vscode.ConfigurationTarget.Workspace,
    );
  });

  it("does nothing when previouslyManaged is empty", async () => {
    await clearManagedExcludes([]);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("preserves user patterns when removing managed ones", async () => {
    mockGet.mockImplementation((_key: string, _defaultValue: unknown) => ({
      node_modules: true,
      ".git": true,
      ".obsidian": true,
    }));

    await clearManagedExcludes([".obsidian"]);

    expect(mockUpdate).toHaveBeenCalledWith(
      "exclude",
      { node_modules: true, ".git": true },
      vscode.ConfigurationTarget.Workspace,
    );
  });
});
