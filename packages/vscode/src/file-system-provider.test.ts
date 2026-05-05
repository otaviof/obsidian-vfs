import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  FileSystemError: {
    FileNotFound: vi.fn((uri: unknown) => new Error(`FileNotFound: ${String(uri)}`)),
    NoPermissions: vi.fn((msg: unknown) => new Error(`NoPermissions: ${String(msg)}`)),
    Unavailable: vi.fn((uri: unknown) => new Error(`Unavailable: ${String(uri)}`)),
    FileExists: vi.fn((uri: unknown) => new Error(`FileExists: ${String(uri)}`)),
  },
  FileType: { File: 1, Directory: 2 },
  FileChangeType: { Changed: 1, Created: 2, Deleted: 3 },
  EventEmitter: class {
    #listeners: ((e: unknown) => void)[] = [];
    event = (listener: (e: unknown) => void) => {
      this.#listeners.push(listener);
      return { dispose: () => undefined };
    };
    fire = (data: unknown) => this.#listeners.forEach((l) => l(data));
    dispose = vi.fn();
  },
  Uri: {
    from: vi.fn((c: { scheme: string; authority: string; path: string }) => ({
      scheme: c.scheme,
      authority: c.authority,
      path: c.path,
      toString: () => `${c.scheme}://${c.authority}${c.path}`,
    })),
  },
}));

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, readVirtualFile: vi.fn(), validatePath: vi.fn() };
});

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import type { LocalIndexTracker } from "@obsidian-vfs/core";
import { readVirtualFile, validatePath } from "@obsidian-vfs/core";
import { makeLocalIndexTrackerWith } from "@obsidian-vfs/core/testing";
import { writeFile as fsWriteFile, mkdir } from "node:fs/promises";
import * as vscode from "vscode";

const { File: FILE, Directory: DIRECTORY } = vscode.FileType;
const { Changed: CHANGED, Created: CREATED, Deleted: DELETED } = vscode.FileChangeType;

import { ObsidianFileSystemProvider } from "./file-system-provider.js";

const mockReadVirtualFile = vi.mocked(readVirtualFile);
const mockValidatePath = vi.mocked(validatePath);
const mockFsWriteFile = vi.mocked(fsWriteFile);
const mockMkdir = vi.mocked(mkdir);

const TRACKER_CONTEXT = { physicalPath: "/vault", name: "TestVault" };

/** Build a mock tracker with provider-required context (vaultRoot, vfsConfig). */
function mockTrackerForProvider(
  extraMethods: Partial<Record<keyof LocalIndexTracker, ReturnType<typeof vi.fn>>> = {},
): LocalIndexTracker {
  const { tracker } = makeLocalIndexTrackerWith(
    "stat",
    { ok: true, value: { type: "file", mtime: 0, ctime: 0, size: 0 } },
    {
      readDirectory: vi.fn(),
      readFile: vi.fn(),
      onDidChangeFile: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      ...extraMethods,
    },
    TRACKER_CONTEXT,
  );
  return tracker;
}

function fakeUri(uriPath: string) {
  return { path: uriPath, toString: () => `obs://TestVault${uriPath}` } as never;
}

describe("ObsidianFileSystemProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("stat", () => {
    it("returns mapped FileStat on success", async () => {
      const tracker = mockTrackerForProvider({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "file", mtime: 1000, ctime: 900, size: 42 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const stat = await provider.stat(fakeUri("/note.md"));

      expect(stat.type).toBe(FILE);
      expect(stat.mtime).toBe(1000);
      expect(stat.ctime).toBe(900);
      expect(stat.size).toBe(42);
    });

    it("maps directory type", async () => {
      const tracker = mockTrackerForProvider({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "directory", mtime: 500, ctime: 400, size: 0 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const stat = await provider.stat(fakeUri("/folder"));

      expect(stat.type).toBe(DIRECTORY);
    });

    it("throws on stat failure", async () => {
      const tracker = mockTrackerForProvider({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "gone" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      await expect(provider.stat(fakeUri("/missing.md"))).rejects.toThrow("FileNotFound");
    });
  });

  describe("readFile", () => {
    it("returns Uint8Array from readVirtualFile", async () => {
      const tracker = mockTrackerForProvider();
      const provider = new ObsidianFileSystemProvider(tracker);
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      mockReadVirtualFile.mockResolvedValueOnce({ ok: true, value: bytes });

      const result = await provider.readFile(fakeUri("/note.md"));
      expect(result).toBe(bytes);
      expect(mockReadVirtualFile).toHaveBeenCalledWith("note.md", {
        vaultRoot: "/vault",
        allowedFolders: [],
      });
    });

    it("throws on readVirtualFile failure", async () => {
      const tracker = mockTrackerForProvider();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockReadVirtualFile.mockResolvedValueOnce({
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: "nope" },
      });

      await expect(provider.readFile(fakeUri("/missing.md"))).rejects.toThrow("FileNotFound");
    });
  });

  describe("readDirectory", () => {
    it("returns mapped directory entries", async () => {
      const tracker = mockTrackerForProvider({
        readDirectory: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            ["note.md", "file"],
            ["subfolder", "directory"],
          ],
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const entries = await provider.readDirectory(fakeUri("/"));

      expect(entries).toEqual([
        ["note.md", FILE],
        ["subfolder", DIRECTORY],
      ]);
    });

    it("throws on readDirectory failure", async () => {
      const tracker = mockTrackerForProvider({
        readDirectory: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "missing dir" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      await expect(provider.readDirectory(fakeUri("/missing"))).rejects.toThrow("FileNotFound");
    });
  });

  describe("writeFile", () => {
    it("writes to existing file with overwrite", async () => {
      const tracker = mockTrackerForProvider({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "file", mtime: 0, ctime: 0, size: 0 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const content = new Uint8Array([65, 66, 67]);

      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/note.md" });
      mockFsWriteFile.mockResolvedValueOnce(undefined);

      await provider.writeFile(fakeUri("/note.md"), content, { create: false, overwrite: true });

      expect(mockFsWriteFile).toHaveBeenCalledWith("/vault/note.md", content);
    });

    it("throws FileNotFound when file missing and create=false", async () => {
      const tracker = mockTrackerForProvider({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "nope" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/new.md" });

      await expect(
        provider.writeFile(fakeUri("/new.md"), new Uint8Array(), {
          create: false,
          overwrite: false,
        }),
      ).rejects.toThrow("FileNotFound");
    });

    it("throws FileExists when file exists and overwrite=false", async () => {
      const tracker = mockTrackerForProvider({
        stat: vi.fn().mockResolvedValue({
          ok: true,
          value: { type: "file", mtime: 0, ctime: 0, size: 0 },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/note.md" });

      await expect(
        provider.writeFile(fakeUri("/note.md"), new Uint8Array(), {
          create: false,
          overwrite: false,
        }),
      ).rejects.toThrow("FileExists");
    });

    it("throws NoPermissions when creating new file (deferred)", async () => {
      const tracker = mockTrackerForProvider({
        stat: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: "new" },
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/new.md" });

      await expect(
        provider.writeFile(fakeUri("/new.md"), new Uint8Array(), {
          create: true,
          overwrite: false,
        }),
      ).rejects.toThrow("NoPermissions");
    });

    it("throws on path validation failure", async () => {
      const tracker = mockTrackerForProvider();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "outside vault" },
      });

      await expect(
        provider.writeFile(fakeUri("/../escape.md"), new Uint8Array(), {
          create: false,
          overwrite: true,
        }),
      ).rejects.toThrow("NoPermissions");
    });
  });

  describe("createDirectory", () => {
    it("creates directory after path validation", async () => {
      const tracker = mockTrackerForProvider();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({ ok: true, value: "/vault/newdir" });
      mockMkdir.mockResolvedValueOnce(undefined);

      await provider.createDirectory(fakeUri("/newdir"));

      expect(mockMkdir).toHaveBeenCalledWith("/vault/newdir", { recursive: true });
    });

    it("throws on path validation failure", async () => {
      const tracker = mockTrackerForProvider();
      const provider = new ObsidianFileSystemProvider(tracker);
      mockValidatePath.mockResolvedValueOnce({
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "outside vault" },
      });

      await expect(provider.createDirectory(fakeUri("/../escape"))).rejects.toThrow("NoPermissions");
    });
  });

  describe("delete", () => {
    it("throws NoPermissions (deferred)", () => {
      const tracker = mockTrackerForProvider();
      const provider = new ObsidianFileSystemProvider(tracker);
      expect(() => provider.delete(fakeUri("/note.md"))).toThrow("NoPermissions");
    });
  });

  describe("rename", () => {
    it("throws NoPermissions (deferred)", () => {
      const tracker = mockTrackerForProvider();
      const provider = new ObsidianFileSystemProvider(tracker);
      expect(() => provider.rename(fakeUri("/old.md"), fakeUri("/new.md"))).toThrow("NoPermissions");
    });
  });

  describe("watch", () => {
    it("registers a file change listener and returns disposable", () => {
      const mockDisposable = { dispose: vi.fn() };
      const tracker = mockTrackerForProvider({
        onDidChangeFile: vi.fn().mockReturnValue(mockDisposable),
      });
      const provider = new ObsidianFileSystemProvider(tracker);
      const disposable = provider.watch(fakeUri("/"));

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tracker.onDidChangeFile).toHaveBeenCalledTimes(1);
      expect(disposable).toBe(mockDisposable);
    });

    it("forwards events under watched prefix with mapped types", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTrackerForProvider({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/notes"));

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
      const tracker = mockTrackerForProvider({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/notes"));

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
      const tracker = mockTrackerForProvider({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/"));

      capturedCallback!([
        { type: "changed", path: "/vault/a.md" },
        { type: "created", path: "/vault/sub/b.md" },
      ]);

      expect(fired).toHaveLength(2);
    });

    it("does not fire when no events match prefix", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTrackerForProvider({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/notes"));

      capturedCallback!([{ type: "changed", path: "/vault/other/doc.md" }]);

      expect(fired).toHaveLength(0);
    });

    it("avoids false prefix match on similar directory names", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTrackerForProvider({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/notes"));

      capturedCallback!([
        { type: "changed", path: "/vault/notes2/plan.md" },
        { type: "changed", path: "/vault/notes-archive/old.md" },
      ]);

      expect(fired).toHaveLength(0);
    });

    it("builds URIs with correct vault name", () => {
      let capturedCallback: (events: readonly { type: string; path: string }[]) => void;
      const tracker = mockTrackerForProvider({
        onDidChangeFile: vi.fn((cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return { dispose: vi.fn() };
        }),
      });
      const provider = new ObsidianFileSystemProvider(tracker);

      const fired: unknown[] = [];
      provider.onDidChangeFile((events) => fired.push(...events));

      provider.watch(fakeUri("/"));

      capturedCallback!([{ type: "changed", path: "/vault/note.md" }]);

      const event = fired[0] as { uri: { scheme: string; authority: string } };
      expect(event.uri.scheme).toBe("obs");
      expect(event.uri.authority).toBe("TestVault");
    });
  });
});
