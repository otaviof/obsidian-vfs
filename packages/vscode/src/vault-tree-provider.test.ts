import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock, mockLocalIndexTracker } from "./test-helpers.js";

vi.mock("vscode", () =>
  createVscodeMock({ eventEmitter: true, treeView: true, uri: true, workspace: true }),
);

import * as vscode from "vscode";

import { CONFIG_PROP } from "./types.js";
import { VaultTreeDataProvider, VaultTreeItem, readAutoMount } from "./vault-tree-provider.js";

describe("VaultTreeItem", () => {
  it("creates a collapsed folder item", () => {
    const item = new VaultTreeItem("notes", "notes", "directory", "/vault");

    expect(item.label).toBe("notes");
    expect(item.vaultPath).toBe("notes");
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(item.contextValue).toBe("obsFolder");
    expect(item.command).toBeUndefined();
  });

  it("creates a file item with open command", () => {
    const item = new VaultTreeItem("readme.md", "docs/readme.md", "file", "/vault");

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

  it("returns empty tree when autoMount is empty", async () => {
    const tracker = mockLocalIndexTracker();
    const provider = new VaultTreeDataProvider(tracker);
    const children = await provider.getChildren();

    expect(children).toEqual([]);

    provider.dispose();
  });

  it("returns configured autoMount folders as roots", async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => {
        if (_key === CONFIG_PROP.autoMount) return ["10-projects", "20-areas"];
        return defaultValue;
      }),
    } as never);

    const tracker = mockLocalIndexTracker({
      stat: vi.fn().mockResolvedValue({
        ok: true,
        value: { type: "directory", mtime: 0, ctime: 0, size: 0 },
      }),
    });
    const provider = new VaultTreeDataProvider(tracker);
    const children = await provider.getChildren();

    expect(children).toHaveLength(2);
    expect(children[0].label).toBe("10-projects");
    expect(children[0].vaultPath).toBe("10-projects");
    expect(children[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(children[1].label).toBe("20-areas");

    provider.dispose();
  });

  it("renders file-type root entries with no collapse arrow", async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => {
        if (_key === CONFIG_PROP.autoMount) return ["10-projects", "notes/todo.md"];
        return defaultValue;
      }),
    } as never);

    const tracker = mockLocalIndexTracker({
      stat: vi
        .fn()
        .mockImplementation((path: string) =>
          Promise.resolve(
            path === "notes/todo.md"
              ? { ok: true, value: { type: "file", mtime: 0, ctime: 0, size: 42 } }
              : { ok: true, value: { type: "directory", mtime: 0, ctime: 0, size: 0 } },
          ),
        ),
    });
    const provider = new VaultTreeDataProvider(tracker);
    const children = await provider.getChildren();

    expect(children).toHaveLength(2);
    expect(children[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(children[0].contextValue).toBe("obsFolder");
    expect(children[1].label).toBe("notes/todo.md");
    expect(children[1].collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    expect(children[1].contextValue).toBe("obsFile");
    expect(children[1].command).toMatchObject({ command: "vscode.open", title: "Open" });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tracker.stat).toHaveBeenCalledTimes(2);

    provider.dispose();
  });

  it("falls back to directory when stat fails", async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => {
        if (_key === CONFIG_PROP.autoMount) return ["missing-entry"];
        return defaultValue;
      }),
    } as never);

    const tracker = mockLocalIndexTracker({
      stat: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: "not found" },
      }),
    });
    const provider = new VaultTreeDataProvider(tracker);
    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(children[0].contextValue).toBe("obsFolder");

    provider.dispose();
  });

  it("returns nested children for a folder element", async () => {
    const tracker = mockLocalIndexTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          ["sub", "directory"],
          ["file.md", "file"],
        ],
      }),
    });

    const provider = new VaultTreeDataProvider(tracker);
    const parent = new VaultTreeItem("projects", "projects", "directory", "/vault");
    const children = await provider.getChildren(parent);

    expect(children).toHaveLength(2);
    expect(children[0].vaultPath).toBe("projects/sub");
    expect(children[1].vaultPath).toBe("projects/file.md");

    provider.dispose();
  });

  it("sorts folders before files, then alphabetically", async () => {
    const tracker = mockLocalIndexTracker({
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
    const parent = new VaultTreeItem("root", "root", "directory", "/vault");
    const children = await provider.getChildren(parent);
    const labels = children.map((c) => c.label);

    expect(labels).toEqual(["a-folder", "b-folder", "a-file.md", "z-file.md"]);

    provider.dispose();
  });

  it("returns empty array on readDirectory failure", async () => {
    const tracker = mockLocalIndexTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: "nope" },
      }),
    });

    const provider = new VaultTreeDataProvider(tracker);
    const parent = new VaultTreeItem("root", "root", "directory", "/vault");
    const children = await provider.getChildren(parent);

    expect(children).toEqual([]);

    provider.dispose();
  });

  it("fires onDidChangeTreeData on refresh()", () => {
    const tracker = mockLocalIndexTracker();
    const provider = new VaultTreeDataProvider(tracker);

    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.refresh();

    expect(listener).toHaveBeenCalledWith(undefined);

    provider.dispose();
  });

  it("returns empty tree when disabled", async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => {
        if (_key === CONFIG_PROP.autoMount) return ["10-projects"];
        return defaultValue;
      }),
    } as never);

    const tracker = mockLocalIndexTracker({
      stat: vi.fn().mockResolvedValue({
        ok: true,
        value: { type: "directory", mtime: 0, ctime: 0, size: 0 },
      }),
    });
    const provider = new VaultTreeDataProvider(tracker);

    provider.enabled = false;
    const children = await provider.getChildren();
    expect(children).toEqual([]);

    provider.dispose();
  });

  it("refreshes when enabled changes", () => {
    const tracker = mockLocalIndexTracker();
    const provider = new VaultTreeDataProvider(tracker);

    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.enabled = false;
    expect(listener).toHaveBeenCalledTimes(1);

    listener.mockClear();
    provider.enabled = false;
    expect(listener).not.toHaveBeenCalled();

    provider.dispose();
  });

  it("getTreeItem returns the element itself", () => {
    const tracker = mockLocalIndexTracker();
    const provider = new VaultTreeDataProvider(tracker);
    const item = new VaultTreeItem("test.md", "test.md", "file", "/vault");

    expect(provider.getTreeItem(item)).toBe(item);

    provider.dispose();
  });

  describe("getParent", () => {
    it("returns undefined for root-level items", () => {
      const tracker = mockLocalIndexTracker();
      const provider = new VaultTreeDataProvider(tracker);
      const item = new VaultTreeItem("notes", "notes", "directory", "/vault");

      expect(provider.getParent(item)).toBeUndefined();

      provider.dispose();
    });

    it("returns parent folder for nested file", () => {
      const tracker = mockLocalIndexTracker();
      const provider = new VaultTreeDataProvider(tracker);
      const item = new VaultTreeItem("readme.md", "docs/readme.md", "file", "/vault");

      const parent = provider.getParent(item);
      expect(parent).toBeDefined();
      expect(parent!.label).toBe("docs");
      expect(parent!.vaultPath).toBe("docs");
      expect(parent!.contextValue).toBe("obsFolder");

      provider.dispose();
    });

    it("returns parent folder for deeply nested item", () => {
      const tracker = mockLocalIndexTracker();
      const provider = new VaultTreeDataProvider(tracker);
      const item = new VaultTreeItem("plan.md", "projects/active/plan.md", "file", "/vault");

      const parent = provider.getParent(item);
      expect(parent).toBeDefined();
      expect(parent!.label).toBe("active");
      expect(parent!.vaultPath).toBe("projects/active");

      provider.dispose();
    });

    it("returns parent for nested directory", () => {
      const tracker = mockLocalIndexTracker();
      const provider = new VaultTreeDataProvider(tracker);
      const item = new VaultTreeItem("sub", "notes/sub", "directory", "/vault");

      const parent = provider.getParent(item);
      expect(parent).toBeDefined();
      expect(parent!.label).toBe("notes");
      expect(parent!.vaultPath).toBe("notes");

      provider.dispose();
    });
  });
});

describe("readAutoMount", () => {
  it("reads autoMount from workspace configuration", () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => {
        if (_key === CONFIG_PROP.autoMount) return ["a", "b"];
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
