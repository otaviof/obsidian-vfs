import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock, fakeUri, mockTracker } from "./test-mocks.js";

vi.mock("vscode", () =>
  createVscodeMock({
    fileSystemError: true,
    fileType: true,
    fileChangeType: true,
    eventEmitter: true,
    uri: true,
    workspace: true,
  }),
);

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    readVirtualFile: vi.fn(),
    validatePath: vi.fn(),
    validatePathForWrite: vi.fn(),
  };
});

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
}));

import { readVirtualFile, validatePath, validatePathForWrite } from "@obsidian-vfs/core";
import { writeFile as fsWriteFile, mkdir, rename as fsRename, rm } from "node:fs/promises";
import * as vscode from "vscode";

const { File: FILE, Directory: DIRECTORY } = vscode.FileType;
const { Changed: CHANGED, Created: CREATED, Deleted: DELETED } = vscode.FileChangeType;

import { ObsidianFileSystemProvider } from "./file-system-provider.js";

const mockReadVirtualFile = vi.mocked(readVirtualFile);
const mockValidatePath = vi.mocked(validatePath);
const mockValidatePathForWrite = vi.mocked(validatePathForWrite);
const mockFsWriteFile = vi.mocked(fsWriteFile);
const mockMkdir = vi.mocked(mkdir);
const mockFsRename = vi.mocked(fsRename);
const mockRm = vi.mocked(rm);
// eslint-disable-next-line @typescript-eslint/unbound-method
const mockWorkspaceFsReadFile = vi.mocked(vscode.workspace.fs.readFile);
// eslint-disable-next-line @typescript-eslint/unbound-method
const mockWorkspaceFsCopy = vi.mocked(vscode.workspace.fs.copy);

describe("ObsidianFileSystemProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe("stat", () => {
    it("returns mapped FileStat on success", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "file", mtime: 1000, ctime: 900, size: 42 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const stat = await provider.stat(fakeUri("/note.md") as never);

      expect(stat.type).toBe(FILE);
      expect(stat.mtime).toBe(1000);
      expect(stat.ctime).toBe(900);
      expect(stat.size).toBe(42);
    });

    it("maps directory type", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "directory", mtime: 500, ctime: 400, size: 0 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const stat = await provider.stat(fakeUri("/folder") as never);

      expect(stat.type).toBe(DIRECTORY);
    });

    it("throws on stat failure", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "gone" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      await expect(provider.stat(fakeUri("/missing.md") as never)).rejects.toThrow("FileNotFound");
    });
  });

  describe("readFile", () => {
    it("returns Uint8Array from readVirtualFile", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      mockReadVirtualFile.mockResolvedValueOnce({ ok: true, value: bytes });

      const result = await provider.readFile(fakeUri("/note.md") as never);
      expect(result).toBe(bytes);
      expect(mockReadVirtualFile).toHaveBeenCalledWith("note.md", {
        vaultRoot: "/vault",
        allowed: [],
        blocked: [],
      });
    });

    it("throws on readVirtualFile failure", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockReadVirtualFile.mockResolvedValueOnce({
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: "nope" },
      });

      await expect(provider.readFile(fakeUri("/missing.md") as never)).rejects.toThrow(
        "FileNotFound",
      );
    });
  });

  describe("readDirectory", () => {
    it("returns mapped directory entries", async () => {
      const tracker = mockTracker({
        readDirectory: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            ["note.md", "file"],
            ["subfolder", "directory"],
          ],
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const entries = await provider.readDirectory(fakeUri("/") as never);

      expect(entries).toEqual([
        ["note.md", FILE],
        ["subfolder", DIRECTORY],
      ]);
    });

    it("throws on readDirectory failure", async () => {
      const tracker = mockTracker({
        readDirectory: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "missing dir" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      await expect(provider.readDirectory(fakeUri("/missing") as never)).rejects.toThrow(
        "FileNotFound",
      );
    });

    it("filters root entries by autoMount when set", async () => {
      const tracker = mockTracker({
        readDirectory: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            ["Notes", "directory"],
            ["Private", "directory"],
            ["Projects", "directory"],
          ],
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker, ["Notes", "Projects"]);
      const entries = await provider.readDirectory(fakeUri("/") as never);

      expect(entries).toEqual([
        ["Notes", DIRECTORY],
        ["Projects", DIRECTORY],
      ]);
    });

    it("does not filter non-root entries by autoMount", async () => {
      const tracker = mockTracker({
        readDirectory: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            ["plan.md", "file"],
            ["archive", "directory"],
          ],
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker, ["Notes"]);
      const entries = await provider.readDirectory(fakeUri("/Notes") as never);

      expect(entries).toEqual([
        ["plan.md", FILE],
        ["archive", DIRECTORY],
      ]);
    });

    it("returns all root entries when autoMount is empty", async () => {
      const tracker = mockTracker({
        readDirectory: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            ["Notes", "directory"],
            ["Private", "directory"],
          ],
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const entries = await provider.readDirectory(fakeUri("/") as never);

      expect(entries).toEqual([
        ["Notes", DIRECTORY],
        ["Private", DIRECTORY],
      ]);
    });

    it("extracts first path segment for file-level autoMount entries", async () => {
      const tracker = mockTracker({
        readDirectory: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            ["docs", "directory"],
            ["Notes", "directory"],
            ["other", "directory"],
          ],
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker, ["Notes", "docs/readme.md"]);
      const entries = await provider.readDirectory(fakeUri("/") as never);

      expect(entries).toEqual([
        ["docs", DIRECTORY],
        ["Notes", DIRECTORY],
      ]);
    });
  });

  describe("setAutoMount", () => {
    it("updates root filtering on subsequent readDirectory calls", async () => {
      const tracker = mockTracker({
        readDirectory: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            ["Notes", "directory"],
            ["Projects", "directory"],
            ["Private", "directory"],
          ],
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker, ["Notes"]);

      provider.setAutoMount(["Notes", "Projects"]);

      const entries = await provider.readDirectory(fakeUri("/") as never);
      expect(entries).toEqual([
        ["Notes", DIRECTORY],
        ["Projects", DIRECTORY],
      ]);
    });

    it("fires Created event for added entries", () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker, ["Notes"]);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.setAutoMount(["Notes", "Projects"]);

      expect(fired).toHaveLength(1);
      const event = fired[0] as { type: number; uri: { path: string } };
      expect(event.type).toBe(CREATED);
      expect(event.uri.path).toBe("/Projects");
    });

    it("fires Deleted event for removed entries", () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker, ["Notes", "Projects"]);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.setAutoMount(["Notes"]);

      expect(fired).toHaveLength(1);
      const event = fired[0] as { type: number; uri: { path: string } };
      expect(event.type).toBe(DELETED);
      expect(event.uri.path).toBe("/Projects");
    });

    it("fires both Created and Deleted events on replacement", () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker, ["Notes"]);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.setAutoMount(["Projects"]);

      expect(fired).toHaveLength(2);
      const events = fired as { type: number; uri: { path: string } }[];
      expect(events).toContainEqual(
        expect.objectContaining({
          type: CREATED,
          uri: expect.objectContaining({ path: "/Projects" }),
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({ type: DELETED, uri: expect.objectContaining({ path: "/Notes" }) }),
      );
    });

    it("does not fire events when autoMount set is unchanged", () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker, ["Notes", "Projects"]);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.setAutoMount(["Projects", "Notes"]);

      expect(fired).toHaveLength(0);
    });
  });

  describe("writeFile", () => {
    it("writes to existing file with overwrite", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "file", mtime: 0, ctime: 0, size: 0 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const content = new Uint8Array([65, 66, 67]);

      mockValidatePathForWrite.mockResolvedValueOnce({ ok: true, value: "/vault/note.md" });
      mockFsWriteFile.mockResolvedValueOnce(undefined);

      await provider.writeFile(fakeUri("/note.md") as never, content, {
        create: false,
        overwrite: true,
      });

      expect(mockMkdir).toHaveBeenCalledWith("/vault", { recursive: true });
      expect(mockFsWriteFile).toHaveBeenCalledWith("/vault/note.md", content);
    });

    it("creates parent directories for new file with create=true", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "nope" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const content = new Uint8Array([72, 73]);

      mockValidatePathForWrite.mockResolvedValueOnce({
        ok: true,
        value: "/vault/deep/nested/new.md",
      });
      mockFsWriteFile.mockResolvedValueOnce(undefined);

      await provider.writeFile(fakeUri("/deep/nested/new.md") as never, content, {
        create: true,
        overwrite: false,
      });

      expect(mockMkdir).toHaveBeenCalledWith("/vault/deep/nested", { recursive: true });
      expect(mockFsWriteFile).toHaveBeenCalledWith("/vault/deep/nested/new.md", content);
    });

    it("throws FileNotFound when file missing and create=false", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "nope" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePathForWrite.mockResolvedValueOnce({ ok: true, value: "/vault/new.md" });

      await expect(
        provider.writeFile(fakeUri("/new.md") as never, new Uint8Array(), {
          create: false,
          overwrite: false,
        }),
      ).rejects.toThrow("FileNotFound");
    });

    it("throws FileExists when file exists and overwrite=false", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "file", mtime: 0, ctime: 0, size: 0 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePathForWrite.mockResolvedValueOnce({ ok: true, value: "/vault/note.md" });

      await expect(
        provider.writeFile(fakeUri("/note.md") as never, new Uint8Array(), {
          create: false,
          overwrite: false,
        }),
      ).rejects.toThrow("FileExists");
    });

    it("throws on path validation failure", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePathForWrite.mockResolvedValueOnce({
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "outside vault" },
      });

      await expect(
        provider.writeFile(fakeUri("/../escape.md") as never, new Uint8Array(), {
          create: false,
          overwrite: true,
        }),
      ).rejects.toThrow("NoPermissions");
    });
  });

  describe("createDirectory", () => {
    it("creates directory after path validation", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePathForWrite.mockResolvedValueOnce({ ok: true, value: "/vault/newdir" });
      mockMkdir.mockResolvedValueOnce(undefined);

      await provider.createDirectory(fakeUri("/newdir") as never);

      expect(mockMkdir).toHaveBeenCalledWith("/vault/newdir", { recursive: true });
    });

    it("throws on path validation failure", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePathForWrite.mockResolvedValueOnce({
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "outside vault" },
      });

      await expect(provider.createDirectory(fakeUri("/../escape") as never)).rejects.toThrow(
        "NoPermissions",
      );
    });
  });

  describe("copy", () => {
    it("reads source and writes to destination", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "nope" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const bytes = new Uint8Array([1, 2, 3]);

      mockWorkspaceFsReadFile.mockResolvedValueOnce(bytes);
      mockValidatePathForWrite.mockResolvedValueOnce({
        ok: true,
        value: "/vault/notes/copy.md",
      });
      mockFsWriteFile.mockResolvedValueOnce(undefined);

      const source = fakeUri("/source.md", "TestVault", "file");
      const dest = fakeUri("/notes/copy.md");

      await provider.copy(source as never, dest as never, { overwrite: false });

      expect(mockWorkspaceFsReadFile).toHaveBeenCalledWith(source);
      expect(mockFsWriteFile).toHaveBeenCalledWith("/vault/notes/copy.md", bytes);
    });

    it("fires Created change event on success", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "nope" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      mockWorkspaceFsReadFile.mockResolvedValueOnce(new Uint8Array());
      mockValidatePathForWrite.mockResolvedValueOnce({
        ok: true,
        value: "/vault/dest.md",
      });
      mockFsWriteFile.mockResolvedValueOnce(undefined);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      const dest = fakeUri("/dest.md");
      await provider.copy(fakeUri("/src.md", "TestVault", "file") as never, dest as never, {
        overwrite: false,
      });

      expect(fired).toHaveLength(1);
      const event = fired[0] as { type: number; uri: { path: string } };
      expect(event.type).toBe(CREATED);
      expect(event.uri.path).toBe("/dest.md");
    });

    it("throws FileExists when overwrite=false and destination exists", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "file", mtime: 0, ctime: 0, size: 10 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      mockWorkspaceFsReadFile.mockResolvedValueOnce(new Uint8Array());
      mockValidatePathForWrite.mockResolvedValueOnce({
        ok: true,
        value: "/vault/existing.md",
      });

      await expect(
        provider.copy(
          fakeUri("/src.md", "TestVault", "file") as never,
          fakeUri("/existing.md") as never,
          { overwrite: false },
        ),
      ).rejects.toThrow("FileExists");
    });

    it("throws on path validation failure", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);

      mockWorkspaceFsReadFile.mockResolvedValueOnce(new Uint8Array());
      mockValidatePathForWrite.mockResolvedValueOnce({
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "outside vault" },
      });

      await expect(
        provider.copy(
          fakeUri("/src.md", "TestVault", "file") as never,
          fakeUri("/../escape.md") as never,
          { overwrite: false },
        ),
      ).rejects.toThrow("NoPermissions");
    });
  });

  describe("delete", () => {
    it("deletes file after path validation", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/note.md" });

      await provider.delete(fakeUri("/note.md") as never, { recursive: false });

      expect(mockRm).toHaveBeenCalledWith("/vault/note.md", { recursive: false });
    });

    it("passes recursive flag through", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/folder" });

      await provider.delete(fakeUri("/folder") as never, { recursive: true });

      expect(mockRm).toHaveBeenCalledWith("/vault/folder", { recursive: true });
    });

    it("throws on path validation failure", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "outside vault" },
      });

      await expect(
        provider.delete(fakeUri("/../escape.md") as never, { recursive: false }),
      ).rejects.toThrow("NoPermissions");
    });
  });

  describe("rename", () => {
    it("renames file within vault using fs.rename", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "nope" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/old.md" });
      mockValidatePathForWrite.mockResolvedValueOnce({ ok: true, value: "/vault/new.md" });

      await provider.rename(fakeUri("/old.md") as never, fakeUri("/new.md") as never, {
        overwrite: true,
      });

      expect(mockMkdir).toHaveBeenCalledWith("/vault", { recursive: true });
      expect(mockFsRename).toHaveBeenCalledWith("/vault/old.md", "/vault/new.md");
    });

    it("creates parent directories for rename destination", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "nope" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/old.md" });
      mockValidatePathForWrite.mockResolvedValueOnce({ ok: true, value: "/vault/deep/new.md" });

      await provider.rename(fakeUri("/old.md") as never, fakeUri("/deep/new.md") as never, {
        overwrite: true,
      });

      expect(mockMkdir).toHaveBeenCalledWith("/vault/deep", { recursive: true });
      expect(mockFsRename).toHaveBeenCalledWith("/vault/old.md", "/vault/deep/new.md");
    });

    it("throws FileExists when overwrite=false and dest exists", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "file", mtime: 0, ctime: 0, size: 0 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/old.md" });
      mockValidatePathForWrite.mockResolvedValueOnce({ ok: true, value: "/vault/existing.md" });

      await expect(
        provider.rename(fakeUri("/old.md") as never, fakeUri("/existing.md") as never, {
          overwrite: false,
        }),
      ).rejects.toThrow("FileExists");
    });

    it("throws on source path validation failure", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "outside vault" },
      });

      await expect(
        provider.rename(fakeUri("/../escape.md") as never, fakeUri("/dest.md") as never, {
          overwrite: true,
        }),
      ).rejects.toThrow("NoPermissions");
    });

    it("copies to destination and deletes source for outbound cross-scheme move", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/note.md" });

      const source = fakeUri("/note.md");
      const dest = fakeUri("/workspace/note.md", "", "file");

      await provider.rename(source as never, dest as never, { overwrite: false });

      expect(mockWorkspaceFsCopy).toHaveBeenCalledWith(source, dest, { overwrite: false });
      expect(mockRm).toHaveBeenCalledWith("/vault/note.md", { recursive: false });
    });

    it("copies without deleting source for inbound cross-scheme move", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);

      const source = fakeUri("/workspace/note.md", "", "file");
      const dest = fakeUri("/note.md");

      await provider.rename(source as never, dest as never, { overwrite: false });

      expect(mockWorkspaceFsCopy).toHaveBeenCalledWith(source, dest, { overwrite: false });
      expect(mockRm).not.toHaveBeenCalled();
    });
  });

  describe("watch", () => {
    it("registers a file change listener and returns disposable", () => {
      const mockDisposable = { dispose: vi.fn() };
      const tracker = mockTracker({
        onDidChangeFile: vi.fn().mockReturnValue(mockDisposable),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const disposable = provider.watch(fakeUri("/") as never);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tracker.onDidChangeFile).toHaveBeenCalledTimes(1);
      expect(disposable).toBe(mockDisposable);
    });

    it("forwards events under watched prefix with mapped types", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTracker({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/notes") as never);

      capturedCallback!([
        { type: "changed", path: "/vault/notes/plan.md" },
        { type: "created", path: "/vault/notes/new.md" },
        { type: "deleted", path: "/vault/notes/old.md" },
      ]);

      expect(fired).toHaveLength(3);
      const events = fired as { type: number; uri: { path: string } }[];
      expect(events[0]).toMatchObject({ type: CHANGED, uri: { path: "/notes/plan.md" } });
      expect(events[1]).toMatchObject({ type: CREATED, uri: { path: "/notes/new.md" } });
      expect(events[2]).toMatchObject({ type: DELETED, uri: { path: "/notes/old.md" } });
    });

    it("filters out events outside watched prefix", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTracker({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/notes") as never);

      capturedCallback!([
        { type: "changed", path: "/vault/notes/plan.md" },
        { type: "changed", path: "/vault/other/doc.md" },
      ]);

      expect(fired).toHaveLength(1);
      const event = fired[0] as { uri: { path: string } };
      expect(event.uri.path).toBe("/notes/plan.md");
    });

    it("root watch forwards all events", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTracker({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/") as never);

      capturedCallback!([
        { type: "changed", path: "/vault/a.md" },
        { type: "created", path: "/vault/sub/b.md" },
      ]);

      expect(fired).toHaveLength(2);
    });

    it("does not fire when no events match prefix", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTracker({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/notes") as never);

      capturedCallback!([{ type: "changed", path: "/vault/other/doc.md" }]);

      expect(fired).toHaveLength(0);
    });

    it("avoids false prefix match on similar directory names", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTracker({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/notes") as never);

      capturedCallback!([
        { type: "changed", path: "/vault/notes2/plan.md" },
        { type: "changed", path: "/vault/notes-archive/old.md" },
      ]);

      expect(fired).toHaveLength(0);
    });

    it("builds URIs with correct vault name", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTracker({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/") as never);

      capturedCallback!([{ type: "changed", path: "/vault/note.md" }]);

      const event = fired[0] as { uri: { scheme: string; authority: string } };
      expect(event.uri.scheme).toBe("obs");
      expect(event.uri.authority).toBe("TestVault");
    });
  });
});
