import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock, fakeUri, mockTracker } from "./test-mocks.js";

vi.mock("vscode", () =>
  createVscodeMock({
    fileSystemError: true,
    fileType: true,
    fileChangeType: true,
    eventEmitter: true,
    uri: true,
  }),
);

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, readVirtualFile: vi.fn(), validatePath: vi.fn() };
});

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readVirtualFile, validatePath } from "@obsidian-vfs/core";
import { writeFile as fsWriteFile, mkdir } from "node:fs/promises";
import * as vscode from "vscode";

const { File: FILE, Directory: DIRECTORY } = vscode.FileType;
const { Changed: CHANGED, Created: CREATED, Deleted: DELETED } = vscode.FileChangeType;

import { ObsidianFileSystemProvider } from "./file-system-provider.js";

const mockReadVirtualFile = vi.mocked(readVirtualFile);
const mockValidatePath = vi.mocked(validatePath);
const mockFsWriteFile = vi.mocked(fsWriteFile);
const mockMkdir = vi.mocked(mkdir);

describe("ObsidianFileSystemProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
        allowedFolders: [],
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

      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/note.md" });
      mockFsWriteFile.mockResolvedValueOnce(undefined);

      await provider.writeFile(fakeUri("/note.md") as never, content, {
        create: false,
        overwrite: true,
      });

      expect(mockFsWriteFile).toHaveBeenCalledWith("/vault/note.md", content);
    });

    it("throws FileNotFound when file missing and create=false", async () => {
      const tracker = mockTracker({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "nope" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/new.md" });

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
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/note.md" });

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
      mockValidatePath.mockResolvedValueOnce({
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
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/newdir" });
      mockMkdir.mockResolvedValueOnce(undefined);

      await provider.createDirectory(fakeUri("/newdir") as never);

      expect(mockMkdir).toHaveBeenCalledWith("/vault/newdir", { recursive: true });
    });

    it("throws on path validation failure", async () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "outside vault" },
      });

      await expect(provider.createDirectory(fakeUri("/../escape") as never)).rejects.toThrow(
        "NoPermissions",
      );
    });
  });

  describe("delete", () => {
    it("throws NoPermissions", () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      expect(() => provider.delete()).toThrow("NoPermissions");
    });
  });

  describe("rename", () => {
    it("throws NoPermissions", () => {
      const tracker = mockTracker();
      const provider = new ObsidianFileSystemProvider(tracker);
      expect(() => provider.rename()).toThrow("NoPermissions");
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
