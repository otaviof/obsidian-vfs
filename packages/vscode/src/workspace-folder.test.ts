import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-mocks.js";

vi.mock("vscode", () => createVscodeMock({ workspace: true, uri: true }));

import * as vscode from "vscode";

import {
  addVaultWorkspaceFolder,
  hasVaultWorkspaceFolder,
  removeVaultWorkspaceFolders,
} from "./workspace-folder.js";

interface FolderEntry {
  uri: { scheme: string };
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
    expect(hasVaultWorkspaceFolder()).toBe(false);
  });

  it("returns false when only file:// folders exist", () => {
    workspace.workspaceFolders = [{ uri: { scheme: "file" }, index: 0 }];
    expect(hasVaultWorkspaceFolder()).toBe(false);
  });

  it("returns true when an obs:// folder exists", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file" }, index: 0 },
      { uri: { scheme: "obs" }, index: 1 },
    ];
    expect(hasVaultWorkspaceFolder()).toBe(true);
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
      { uri: { scheme: "file" }, index: 0 },
      { uri: { scheme: "obs" }, index: 1 },
    ];

    const result = addVaultWorkspaceFolder("MyVault");
    expect(result).toEqual({ status: "already-present" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("returns skipped when no workspace folders exist", () => {
    workspace.workspaceFolders = undefined;

    const result = addVaultWorkspaceFolder("MyVault");
    expect(result).toEqual({ status: "skipped", reason: "no local workspace folder open" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("returns skipped when only non-file:// folders exist", () => {
    workspace.workspaceFolders = [{ uri: { scheme: "untitled" }, index: 0 }];

    const result = addVaultWorkspaceFolder("MyVault");
    expect(result).toEqual({ status: "skipped", reason: "no local workspace folder open" });
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("appends workspace folder when file:// folder exists", () => {
    workspace.workspaceFolders = [{ uri: { scheme: "file" }, index: 0 }];

    const result = addVaultWorkspaceFolder("MyVault");
    expect(result).toEqual({ status: "added" });
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 0, {
      uri: expect.objectContaining({ scheme: "obs", authority: "MyVault" }) as unknown,
      name: "Obsidian: MyVault",
    });
  });

  it("appends at correct index when multiple file:// folders exist", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file" }, index: 0 },
      { uri: { scheme: "file" }, index: 1 },
    ];

    const result = addVaultWorkspaceFolder("MyVault");
    expect(result).toEqual({ status: "added" });
    // Should append at index 2 (end of list)
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(2, 0, {
      uri: expect.objectContaining({ scheme: "obs", authority: "MyVault" }) as unknown,
      name: "Obsidian: MyVault",
    });
  });

  it("returns skipped when workspace folders is empty array", () => {
    workspace.workspaceFolders = [];

    const result = addVaultWorkspaceFolder("MyVault");
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
    removeVaultWorkspaceFolders();
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("removes only obs:// folders", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file" }, index: 0 },
      { uri: { scheme: "obs" }, index: 1 },
    ];

    removeVaultWorkspaceFolders();
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 1);
  });

  it("removes multiple obs:// folders", () => {
    workspace.workspaceFolders = [
      { uri: { scheme: "file" }, index: 0 },
      { uri: { scheme: "obs" }, index: 1 },
      { uri: { scheme: "obs" }, index: 2 },
    ];

    removeVaultWorkspaceFolders();
    // Called twice: once for index 2, once for index 1 (backwards iteration)
    expect(workspace.updateWorkspaceFolders).toHaveBeenCalledTimes(2);
    expect(workspace.updateWorkspaceFolders).toHaveBeenNthCalledWith(1, 2, 1);
    expect(workspace.updateWorkspaceFolders).toHaveBeenNthCalledWith(2, 1, 1);
  });

  it("does not remove file:// folders", () => {
    workspace.workspaceFolders = [{ uri: { scheme: "file" }, index: 0 }];

    removeVaultWorkspaceFolders();
    expect(workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });
});
