import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-helpers.js";

vi.mock("vscode", () =>
  createVscodeMock({
    uri: true,
    workspace: true,
    treeView: true,
  }),
);

import * as vscode from "vscode";

import { VaultTreeDragAndDropController } from "./tree-drag-drop.js";
import { VaultTreeItem } from "./vault-tree-provider.js";

// eslint-disable-next-line @typescript-eslint/unbound-method
const mockWorkspaceFsCopy = vi.mocked(vscode.workspace.fs.copy);

function fakeDataTransfer(uriList: string | undefined): vscode.DataTransfer {
  return {
    get: vi.fn((mime: string) => {
      if (mime === "text/uri-list" && uriList !== undefined) {
        return {
          asString: vi.fn().mockResolvedValue(uriList),
        } as unknown as vscode.DataTransferItem;
      }
      return undefined;
    }),
  } as unknown as vscode.DataTransfer;
}

const token = {} as vscode.CancellationToken;

describe("VaultTreeDragAndDropController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes correct mime types", () => {
    const controller = new VaultTreeDragAndDropController("MyVault");
    expect(controller.dropMimeTypes).toContain("text/uri-list");
    expect(controller.dropMimeTypes).toContain("files");
    expect(controller.dragMimeTypes).toEqual([]);
  });

  it("copies file to vault root when target is undefined", async () => {
    const controller = new VaultTreeDragAndDropController("MyVault");
    const dt = fakeDataTransfer("file:///local/doc.md");

    await controller.handleDrop(undefined, dt, token);

    expect(mockWorkspaceFsCopy).toHaveBeenCalledTimes(1);
    const destUri = mockWorkspaceFsCopy.mock.calls[0][1] as { path: string };
    expect(destUri.path).toBe("/doc.md");
  });

  it("copies file into folder target", async () => {
    const controller = new VaultTreeDragAndDropController("MyVault");
    const target = new VaultTreeItem("notes", "notes", "directory", "/vault");
    const dt = fakeDataTransfer("file:///local/doc.md");

    await controller.handleDrop(target, dt, token);

    expect(mockWorkspaceFsCopy).toHaveBeenCalledTimes(1);
    const destUri = mockWorkspaceFsCopy.mock.calls[0][1] as { path: string };
    expect(destUri.path).toBe("/notes/doc.md");
  });

  it("copies file into parent folder when target is a file", async () => {
    const controller = new VaultTreeDragAndDropController("MyVault");
    const target = new VaultTreeItem("readme.md", "docs/readme.md", "file", "/vault");
    const dt = fakeDataTransfer("file:///local/new.md");

    await controller.handleDrop(target, dt, token);

    expect(mockWorkspaceFsCopy).toHaveBeenCalledTimes(1);
    const destUri = mockWorkspaceFsCopy.mock.calls[0][1] as { path: string };
    expect(destUri.path).toBe("/docs/new.md");
  });

  it("handles multiple URIs in a single drop", async () => {
    const controller = new VaultTreeDragAndDropController("MyVault");
    const dt = fakeDataTransfer("file:///local/a.md\r\nfile:///local/b.md");

    await controller.handleDrop(undefined, dt, token);

    expect(mockWorkspaceFsCopy).toHaveBeenCalledTimes(2);
    const paths = mockWorkspaceFsCopy.mock.calls.map((call) => (call[1] as { path: string }).path);
    expect(paths).toEqual(["/a.md", "/b.md"]);
  });

  it("skips comment lines in URI list", async () => {
    const controller = new VaultTreeDragAndDropController("MyVault");
    const dt = fakeDataTransfer("# comment\nfile:///local/doc.md");

    await controller.handleDrop(undefined, dt, token);

    expect(mockWorkspaceFsCopy).toHaveBeenCalledTimes(1);
  });

  it("does nothing when text/uri-list is missing", async () => {
    const controller = new VaultTreeDragAndDropController("MyVault");
    const dt = fakeDataTransfer(undefined);

    await controller.handleDrop(undefined, dt, token);

    expect(mockWorkspaceFsCopy).not.toHaveBeenCalled();
  });

  it("resolves root-level file target to vault root", async () => {
    const controller = new VaultTreeDragAndDropController("MyVault");
    const target = new VaultTreeItem("todo.md", "todo.md", "file", "/vault");
    const dt = fakeDataTransfer("file:///local/doc.md");

    await controller.handleDrop(target, dt, token);

    const destUri = mockWorkspaceFsCopy.mock.calls[0][1] as { path: string };
    expect(destUri.path).toBe("/doc.md");
  });
});
