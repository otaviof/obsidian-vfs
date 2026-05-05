import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock, mockTracker } from "./test-mocks.js";

vi.mock("vscode", () =>
  createVscodeMock({ eventEmitter: true, treeView: true, uri: true, workspace: true }),
);

import * as vscode from "vscode";

import { VaultTreeDataProvider, VaultTreeItem, readAutoMount } from "./vault-tree-provider.js";

describe("VaultTreeItem", () => {
  it("creates a collapsed folder item", () => {
    const item = new VaultTreeItem("notes", "notes", "directory", "MyVault");

    expect(item.label).toBe("notes");
    expect(item.vaultPath).toBe("notes");
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(item.contextValue).toBe("obsFolder");
    expect(item.command).toBeUndefined();
  });

  it("creates a file item with open command", () => {
    const item = new VaultTreeItem("readme.md", "docs/readme.md", "file", "MyVault");

    expect(item.label).toBe("readme.md");
    expect(item.vaultPath).toBe("docs/readme.md");
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    expect(item.contextValue).toBe("obsFile");
    expect(item.command).toMatchObject({
      command: "vscode.open",
      title: "Open",
    });
  });
});

/** Reset getConfiguration to default (returns defaultValue for any key). */
function resetConfigMock(): void {
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
  } as never);
}

describe("VaultTreeDataProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConfigMock();
  });

  it("returns root children from readDirectory when autoMount is empty", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          ["projects", "directory"],
          ["note.md", "file"],
        ],
      }),
    });

    const provider = new VaultTreeDataProvider(tracker);
    const children = await provider.getChildren();

    expect(children).toHaveLength(2);
    expect(children[0].label).toBe("projects");
    expect(children[0].contextValue).toBe("obsFolder");
    expect(children[1].label).toBe("note.md");
    expect(children[1].contextValue).toBe("obsFile");

    provider.dispose();
  });

  it("returns configured autoMount folders as roots", async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => {
        if (_key === "autoMount") return ["10-projects", "20-areas"];
        return defaultValue;
      }),
    } as never);

    const tracker = mockTracker();
    const provider = new VaultTreeDataProvider(tracker);
    const children = await provider.getChildren();

    expect(children).toHaveLength(2);
    expect(children[0].label).toBe("10-projects");
    expect(children[0].vaultPath).toBe("10-projects");
    expect(children[1].label).toBe("20-areas");

    provider.dispose();
  });

  it("returns nested children for a folder element", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          ["sub", "directory"],
          ["file.md", "file"],
        ],
      }),
    });

    const provider = new VaultTreeDataProvider(tracker);
    const parent = new VaultTreeItem("projects", "projects", "directory", "TestVault");
    const children = await provider.getChildren(parent);

    expect(children).toHaveLength(2);
    expect(children[0].vaultPath).toBe("projects/sub");
    expect(children[1].vaultPath).toBe("projects/file.md");

    provider.dispose();
  });

  it("sorts folders before files, then alphabetically", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          ["z-file.md", "file"],
          ["b-folder", "directory"],
          ["a-file.md", "file"],
          ["a-folder", "directory"],
        ],
      }),
    });

    const provider = new VaultTreeDataProvider(tracker);
    const children = await provider.getChildren();
    const labels = children.map((c) => c.label);

    expect(labels).toEqual(["a-folder", "b-folder", "a-file.md", "z-file.md"]);

    provider.dispose();
  });

  it("returns empty array on readDirectory failure", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: "nope" },
      }),
    });

    const provider = new VaultTreeDataProvider(tracker);
    const children = await provider.getChildren();

    expect(children).toEqual([]);

    provider.dispose();
  });

  it("fires onDidChangeTreeData on refresh()", () => {
    const tracker = mockTracker();
    const provider = new VaultTreeDataProvider(tracker);

    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.refresh();

    expect(listener).toHaveBeenCalledWith(undefined);

    provider.dispose();
  });

  it("getTreeItem returns the element itself", () => {
    const tracker = mockTracker();
    const provider = new VaultTreeDataProvider(tracker);
    const item = new VaultTreeItem("test.md", "test.md", "file", "V");

    expect(provider.getTreeItem(item)).toBe(item);

    provider.dispose();
  });
});

describe("readAutoMount", () => {
  it("reads autoMount from workspace configuration", () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => {
        if (_key === "autoMount") return ["a", "b"];
        return defaultValue;
      }),
    } as never);

    expect(readAutoMount()).toEqual(["a", "b"]);
  });

  it("returns empty array by default", () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
    } as never);

    expect(readAutoMount()).toEqual([]);
  });
});
