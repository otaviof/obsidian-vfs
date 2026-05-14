import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-mocks.js";

vi.mock("vscode", () => createVscodeMock({ workspace: true, uri: true }));

vi.mock("node:fs", () => ({
  default: {
    statSync: vi.fn(() => ({ isDirectory: () => true })),
  },
}));

import fs from "node:fs";
import * as vscode from "vscode";

import { SCHEME } from "./uri-adapter.js";
import {
  FOLDER_NAME_PREFIX,
  addVaultWorkspaceFolder,
  hasVaultWorkspaceFolder,
  removeVaultWorkspaceFolders,
} from "./workspace-folder.js";

interface FolderEntry {
  uri: { scheme: string; fsPath?: string };
  name: string;
  index: number;
}

const workspace = vscode.workspace as unknown as {
  workspaceFolders: FolderEntry[] | undefined;
  updateWorkspaceFolders: ReturnType<typeof vi.fn>;
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

  it("returns true when an obs:// folder exists (backward compat)", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: SCHEME }, name: `${FOLDER_NAME_PREFIX}Notes`, index: 1 },
    ];
    expect(hasVaultWorkspaceFolder("/vault")).toBe(true);
  });

  it("returns true when a managed file:// folder exists", () => {
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
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as never);
  });

  it("returns skipped when autoMount is empty", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    const result = addVaultWorkspaceFolder("/vault", []);
    expect(result).toEqual({ status: "skipped", reason: "no autoMount folders configured" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("returns already-present when obs:// folder exists (backward compat)", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: SCHEME }, name: `${FOLDER_NAME_PREFIX}Notes`, index: 1 },
    ];

    const result = addVaultWorkspaceFolder("/vault", ["Notes"]);
    expect(result).toEqual({ status: "already-present" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("returns already-present when managed file:// folder exists", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      {
        uri: { scheme: "file", fsPath: "/vault/Notes" },
        name: `${FOLDER_NAME_PREFIX}Notes`,
        index: 1,
      },
    ];

    const result = addVaultWorkspaceFolder("/vault", ["Notes"]);
    expect(result).toEqual({ status: "already-present" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("returns skipped when no workspace folders exist", () => {
    workspace.workspaceFolders = undefined;

    const result = addVaultWorkspaceFolder("/vault", ["Notes"]);
    expect(result).toEqual({ status: "skipped", reason: "no local workspace folder open" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("returns skipped when only non-file:// folders exist", () => {
    workspace.workspaceFolders = [{ uri: { scheme: "untitled" }, name: "untitled", index: 0 }];

    const result = addVaultWorkspaceFolder("/vault", ["Notes"]);
    expect(result).toEqual({ status: "skipped", reason: "no local workspace folder open" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("adds one workspace folder per autoMount entry", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    const result = addVaultWorkspaceFolder("/vault", ["Notes", "Projects"]);
    expect(result).toEqual({ status: "added" });
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
      1,
      0,
      {
        uri: expect.objectContaining({ scheme: "file", fsPath: "/vault/Notes" }) as unknown,
        name: `${FOLDER_NAME_PREFIX}Notes`,
      },
      {
        uri: expect.objectContaining({ scheme: "file", fsPath: "/vault/Projects" }) as unknown,
        name: `${FOLDER_NAME_PREFIX}Projects`,
      },
    );
  });

  it("appends at correct index when multiple file:// folders exist", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: "file", fsPath: "/projects/bar" }, name: "bar", index: 1 },
    ];

    const result = addVaultWorkspaceFolder("/vault", ["Notes"]);
    expect(result).toEqual({ status: "added" });
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(2, 0, {
      uri: expect.objectContaining({ scheme: "file", fsPath: "/vault/Notes" }) as unknown,
      name: `${FOLDER_NAME_PREFIX}Notes`,
    });
  });

  it("returns skipped when workspace folders is empty array", () => {
    workspace.workspaceFolders = [];

    const result = addVaultWorkspaceFolder("/vault", ["Notes"]);
    expect(result).toEqual({ status: "skipped", reason: "no local workspace folder open" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("filters out file entries from workspace folders", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    vi.mocked(fs.statSync).mockImplementation((p) => {
      if (String(p).endsWith("Notes")) return { isDirectory: () => true } as never;
      return { isDirectory: () => false } as never;
    });

    const result = addVaultWorkspaceFolder("/vault", ["Notes", "docs/readme.md"]);
    expect(result).toEqual({ status: "added" });
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 0, {
      uri: expect.objectContaining({ scheme: "file", fsPath: "/vault/Notes" }) as unknown,
      name: `${FOLDER_NAME_PREFIX}Notes`,
    });
  });

  it("returns skipped when all autoMount entries are files", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as never);

    const result = addVaultWorkspaceFolder("/vault", ["docs/readme.md"]);
    expect(result).toEqual({ status: "skipped", reason: "no mountable directories in autoMount" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("filters autoMount entries outside allowed folders", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    const security = { vaultRoot: "/vault", allowed: ["Notes"], blocked: [] as string[] };
    const result = addVaultWorkspaceFolder("/vault", ["Notes", "Private"], security);
    expect(result).toEqual({ status: "added" });
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 0, {
      uri: expect.objectContaining({ scheme: "file", fsPath: "/vault/Notes" }) as unknown,
      name: `${FOLDER_NAME_PREFIX}Notes`,
    });
  });

  it("filters autoMount entries inside blocked folders", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    const security = { vaultRoot: "/vault", allowed: [] as string[], blocked: ["Private"] };
    const result = addVaultWorkspaceFolder("/vault", ["Notes", "Private"], security);
    expect(result).toEqual({ status: "added" });
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 0, {
      uri: expect.objectContaining({ scheme: "file", fsPath: "/vault/Notes" }) as unknown,
      name: `${FOLDER_NAME_PREFIX}Notes`,
    });
  });

  it("returns skipped when all autoMount entries are blocked", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    const security = { vaultRoot: "/vault", allowed: [] as string[], blocked: ["Private"] };
    const result = addVaultWorkspaceFolder("/vault", ["Private"], security);
    expect(result).toEqual({ status: "skipped", reason: "no mountable directories in autoMount" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("mounts all entries when no security options provided", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    const result = addVaultWorkspaceFolder("/vault", ["Notes", "Private"]);
    expect(result).toEqual({ status: "added" });
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
      1,
      0,
      expect.objectContaining({ name: `${FOLDER_NAME_PREFIX}Notes` }) as unknown,
      expect.objectContaining({ name: `${FOLDER_NAME_PREFIX}Private` }) as unknown,
    );
  });

  it("handles stat failure gracefully by excluding the entry", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
    ];

    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = addVaultWorkspaceFolder("/vault", ["missing-folder"]);
    expect(result).toEqual({ status: "skipped", reason: "no mountable directories in autoMount" });
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

  it("removes obs:// folders (backward compat)", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: SCHEME }, name: `${FOLDER_NAME_PREFIX}Notes`, index: 1 },
    ];

    removeVaultWorkspaceFolders("/vault");
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 1);
  });

  it("removes multiple obs:// folders (backward compat)", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: "/projects/foo" }, name: "foo", index: 0 },
      { uri: { scheme: SCHEME }, name: `${FOLDER_NAME_PREFIX}Notes`, index: 1 },
      { uri: { scheme: SCHEME }, name: `${FOLDER_NAME_PREFIX}Projects`, index: 2 },
    ];

    removeVaultWorkspaceFolders("/vault");
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledTimes(2);
    expect(workspace.updateWorkspaceFolders).toHaveBeenNthCalledWith(1, 2, 1);
    expect(workspace.updateWorkspaceFolders).toHaveBeenNthCalledWith(2, 1, 1);
  });

  it("removes managed file:// folders", () => {
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
