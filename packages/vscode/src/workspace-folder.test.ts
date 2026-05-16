import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-helpers.js";

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

import { makeDirent } from "@obsidian-vfs/core/testing";

import { SCHEME } from "./uri-adapter.js";
import {
  FOLDER_NAME_PREFIX,
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

  describe("tier separation", () => {
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

    it("writes only workspace-scoped patterns when vault is not a workspace folder", async () => {
      workspace.workspaceFolders = [
        { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      ];
      vi.mocked(readdir).mockResolvedValueOnce([
        "Notes",
        ".obsidian",
        "Private",
      ] as unknown as Awaited<ReturnType<typeof readdir>>);

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

    it("preserves existing .vscode entry in vault folder-scoped patterns", async () => {
      vi.mocked(readdir).mockResolvedValueOnce(["Notes", ".obsidian"] as unknown as Awaited<
        ReturnType<typeof readdir>
      >);
      mockInspect.mockReturnValue({
        workspaceFolderValue: { ".vscode": true, ".obsidian": true },
        workspaceValue: undefined,
      });

      await syncFilesExclude("/vault", ["Notes"], [], []);

      const folderCall = mockUpdate.mock.calls.find(
        (c: unknown[]) => c[2] === vscode.ConfigurationTarget.WorkspaceFolder,
      );
      expect(folderCall?.[1]).toHaveProperty(".vscode");
      expect(folderCall?.[1]).toHaveProperty(".obsidian");
    });
  });

  describe("blocked paths", () => {
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
  });

  describe("sub-path exclusions", () => {
    it("preserves autoMount entries with nested paths", async () => {
      vi.mocked(readdir)
        .mockResolvedValueOnce(["docs", "Notes", ".obsidian"] as unknown as Awaited<
          ReturnType<typeof readdir>
        >)
        .mockResolvedValueOnce([]);

      const result = await syncFilesExclude("/vault", ["docs/readme.md", "Notes"], [], []);

      expect(result).toContain(".obsidian");
      expect(result).not.toContain("docs");
      expect(result).not.toContain("Notes");
    });

    it("computes sub-path exclusions for partially-mounted directories", async () => {
      vi.mocked(readdir)
        .mockResolvedValueOnce(["20-areas", "00-inbox"] as unknown as Awaited<
          ReturnType<typeof readdir>
        >)
        .mockResolvedValueOnce([
          makeDirent("career", true),
          makeDirent("idea", true),
          makeDirent("otaviof", true),
          makeDirent("readme.md", false),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);

      const result = await syncFilesExclude("/vault", ["20-areas/idea"], [], []);

      expect(result).toContain("20-areas/career");
      expect(result).toContain("20-areas/otaviof");
      expect(result).toContain("00-inbox");
      expect(result).not.toContain("20-areas/idea");
      expect(result).not.toContain("20-areas");
    });

    it("skips files in sub-path enumeration (directories only)", async () => {
      vi.mocked(readdir)
        .mockResolvedValueOnce(["20-areas"] as unknown as Awaited<ReturnType<typeof readdir>>)
        .mockResolvedValueOnce([
          makeDirent("idea", true),
          makeDirent("notes.md", false),
          makeDirent("index.md", false),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);

      const result = await syncFilesExclude("/vault", ["20-areas/idea"], [], []);

      expect(result).toEqual([]);
    });

    it("handles deeply nested partial mounts", async () => {
      vi.mocked(readdir)
        .mockResolvedValueOnce(["10-projects"] as unknown as Awaited<ReturnType<typeof readdir>>)
        .mockResolvedValueOnce([
          makeDirent("active", true),
          makeDirent("archived", true),
        ] as unknown as Awaited<ReturnType<typeof readdir>>)
        .mockResolvedValueOnce([
          makeDirent("2024", true),
          makeDirent("2023", true),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);

      const result = await syncFilesExclude("/vault", ["10-projects/active/2024"], [], []);

      expect(result).toContain("10-projects/archived");
      expect(result).toContain("10-projects/active/2023");
      expect(result).not.toContain("10-projects/active/2024");
      expect(result).not.toContain("10-projects");
    });

    it("treats fully-mounted paths as before (no sub-enumeration)", async () => {
      vi.mocked(readdir).mockResolvedValueOnce(["20-areas", "00-inbox"] as unknown as Awaited<
        ReturnType<typeof readdir>
      >);

      const result = await syncFilesExclude("/vault", ["20-areas"], [], []);

      expect(result).toContain("00-inbox");
      expect(result).not.toContain("20-areas");
      expect(readdir).toHaveBeenCalledTimes(1);
    });
  });

  describe("stale pattern cleanup", () => {
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

      const result = await syncFilesExclude(
        "/vault",
        ["Notes"],
        [],
        [".OldDot", "OldDir", "Private"],
      );

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
  });

  describe("migration", () => {
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
  });

  describe("error handling", () => {
    it("returns previouslyManaged when readdir fails", async () => {
      vi.mocked(readdir).mockRejectedValueOnce(new Error("EACCES: permission denied"));

      const result = await syncFilesExclude("/vault", ["Notes"], [], [".obsidian", "Private"]);

      expect(result).toEqual([".obsidian", "Private"]);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("handles sub-readdir failure gracefully", async () => {
      vi.mocked(readdir)
        .mockResolvedValueOnce(["20-areas", "00-inbox"] as unknown as Awaited<
          ReturnType<typeof readdir>
        >)
        .mockRejectedValueOnce(new Error("EACCES"));

      const result = await syncFilesExclude("/vault", ["20-areas/idea"], [], []);

      expect(result).toContain("00-inbox");
      expect(result).not.toContain("20-areas");
    });
  });

  describe("cross-folder cleanup", () => {
    it("removes stale managed patterns from non-vault workspace folders", async () => {
      const projectMockUpdate = vi.fn().mockResolvedValue(undefined);
      const projectMockInspect = vi.fn(() => ({
        workspaceFolderValue: {
          ".obsidian": true,
          Private: true,
          "editor.fontSize": true,
        },
        workspaceValue: undefined,
      }));

      workspace.getConfiguration = vi
        .fn()
        .mockImplementation((_section: string, scope?: unknown) => {
          const isProjectFolder =
            scope &&
            typeof scope === "object" &&
            "fsPath" in scope &&
            scope.fsPath === "/projects/foo";
          if (isProjectFolder) {
            return {
              get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
              inspect: projectMockInspect,
              update: projectMockUpdate,
            };
          }
          return {
            get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
            inspect: mockInspect,
            update: mockUpdate,
          };
        });

      vi.mocked(readdir).mockResolvedValueOnce([
        "Notes",
        ".obsidian",
        "Private",
      ] as unknown as Awaited<ReturnType<typeof readdir>>);

      await syncFilesExclude("/vault", ["Notes"], [], []);

      expect(projectMockUpdate).toHaveBeenCalledWith(
        "exclude",
        { "editor.fontSize": true },
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
    });
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

  it("removes stale managed patterns from non-vault workspace folders on clear", async () => {
    const projectMockUpdate = vi.fn().mockResolvedValue(undefined);
    const projectMockInspect = vi.fn(() => ({
      workspaceFolderValue: {
        ".obsidian": true,
        "editor.fontSize": true,
      },
      workspaceValue: undefined,
    }));

    workspace.getConfiguration = vi.fn().mockImplementation((_section: string, scope?: unknown) => {
      const isProjectFolder =
        scope && typeof scope === "object" && "fsPath" in scope && scope.fsPath === "/projects/foo";
      if (isProjectFolder) {
        return {
          get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
          inspect: projectMockInspect,
          update: projectMockUpdate,
        };
      }
      return {
        get: vi.fn((_key: string, _defaultValue: unknown) => _defaultValue),
        inspect: mockInspect,
        update: mockUpdate,
      };
    });

    await clearManagedExcludes("/vault", [".obsidian"]);

    expect(projectMockUpdate).toHaveBeenCalledWith(
      "exclude",
      { "editor.fontSize": true },
      vscode.ConfigurationTarget.WorkspaceFolder,
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

describe("excludeVaultFromGitDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds path to git.ignoredRepositories when not present", async () => {
    const gitConfig = { get: vi.fn(), update: vi.fn() };
    gitConfig.get.mockReturnValue(["/other/vault"]);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(gitConfig as never);

    await excludeVaultFromGitDetection("/path/to/vault");

    expect(gitConfig.update).toHaveBeenCalledWith(
      "ignoredRepositories",
      ["/other/vault", "/path/to/vault"],
      vscode.ConfigurationTarget.Global,
    );
  });

  it("is idempotent when path already present", async () => {
    const gitConfig = { get: vi.fn(), update: vi.fn() };
    gitConfig.get.mockReturnValue(["/path/to/vault", "/other/vault"]);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(gitConfig as never);

    await excludeVaultFromGitDetection("/path/to/vault");

    expect(gitConfig.update).not.toHaveBeenCalled();
  });

  it("creates array when ignoredRepositories is empty", async () => {
    const gitConfig = { get: vi.fn(), update: vi.fn() };
    gitConfig.get.mockReturnValue([]);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(gitConfig as never);

    await excludeVaultFromGitDetection("/path/to/vault");

    expect(gitConfig.update).toHaveBeenCalledWith(
      "ignoredRepositories",
      ["/path/to/vault"],
      vscode.ConfigurationTarget.Global,
    );
  });

  it("uses ConfigurationTarget.Global", async () => {
    const gitConfig = { get: vi.fn(), update: vi.fn() };
    gitConfig.get.mockReturnValue([]);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(gitConfig as never);

    await excludeVaultFromGitDetection("/vault");

    expect(gitConfig.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      vscode.ConfigurationTarget.Global,
    );
  });
});

describe("includeVaultInGitDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes path from git.ignoredRepositories when present", async () => {
    const gitConfig = { get: vi.fn(), update: vi.fn() };
    gitConfig.get.mockReturnValue(["/path/to/vault", "/other/vault"]);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(gitConfig as never);

    await includeVaultInGitDetection("/path/to/vault");

    expect(gitConfig.update).toHaveBeenCalledWith(
      "ignoredRepositories",
      ["/other/vault"],
      vscode.ConfigurationTarget.Global,
    );
  });

  it("is idempotent when path not present", async () => {
    const gitConfig = { get: vi.fn(), update: vi.fn() };
    gitConfig.get.mockReturnValue(["/other/vault"]);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(gitConfig as never);

    await includeVaultInGitDetection("/path/to/vault");

    expect(gitConfig.update).not.toHaveBeenCalled();
  });

  it("writes undefined when array becomes empty", async () => {
    const gitConfig = { get: vi.fn(), update: vi.fn() };
    gitConfig.get.mockReturnValue(["/path/to/vault"]);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(gitConfig as never);

    await includeVaultInGitDetection("/path/to/vault");

    expect(gitConfig.update).toHaveBeenCalledWith(
      "ignoredRepositories",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
  });

  it("preserves other entries when removing one path", async () => {
    const gitConfig = { get: vi.fn(), update: vi.fn() };
    gitConfig.get.mockReturnValue(["/vault1", "/vault2", "/vault3"]);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(gitConfig as never);

    await includeVaultInGitDetection("/vault2");

    expect(gitConfig.update).toHaveBeenCalledWith(
      "ignoredRepositories",
      ["/vault1", "/vault3"],
      vscode.ConfigurationTarget.Global,
    );
  });

  it("uses ConfigurationTarget.Global", async () => {
    const gitConfig = { get: vi.fn(), update: vi.fn() };
    gitConfig.get.mockReturnValue(["/vault", "/other"]);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(gitConfig as never);

    await includeVaultInGitDetection("/vault");

    expect(gitConfig.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      vscode.ConfigurationTarget.Global,
    );
  });
});
