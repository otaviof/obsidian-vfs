import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dirent } from "node:fs";

import { readDirectory, statVirtualFile } from "./fs-enumeration.js";
import { mockFsFunction } from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
}));

const { readdir, stat, realpath } = await import("node:fs/promises");
const readdirMock = mockFsFunction(readdir);
const statMock = mockFsFunction(stat);
const realpathMock = mockFsFunction(realpath);

const OPTIONS = { vaultRoot: "/vault", allowedFolders: [] as string[] };

function makeDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: "/vault",
    path: "/vault",
  };
}

describe("readDirectory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    realpathMock.mockImplementation((...args: unknown[]) => Promise.resolve(args[0]));
  });

  it("lists entries with types sorted alphabetically", async () => {
    readdirMock.mockResolvedValueOnce([
      makeDirent("notes", true),
      makeDirent("file.md", false),
      makeDirent("agents", true),
    ]);
    const result = await readDirectory(".", OPTIONS);
    expect(result).toEqual({
      ok: true,
      value: [
        ["agents", "directory"],
        ["file.md", "file"],
        ["notes", "directory"],
      ],
    });
  });

  it("filters hidden entries", async () => {
    readdirMock.mockResolvedValueOnce([
      makeDirent(".obsidian", true),
      makeDirent(".git", true),
      makeDirent("notes", true),
    ]);
    const result = await readDirectory(".", OPTIONS);
    expect(result).toEqual({ ok: true, value: [["notes", "directory"]] });
  });

  it("returns PERMISSION_DENIED on path traversal", async () => {
    const result = await readDirectory("../../etc", OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("enforces allowedFolders on children", async () => {
    const options = { vaultRoot: "/vault", allowedFolders: ["notes"] };
    readdirMock.mockResolvedValueOnce([makeDirent("notes", true), makeDirent("private", true)]);
    const result = await readDirectory(".", options);
    expect(result).toEqual({ ok: true, value: [["notes", "directory"]] });
  });

  it("returns FILE_NOT_FOUND on ENOENT", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    readdirMock.mockRejectedValueOnce(err);
    const result = await readDirectory("missing", OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("returns FILE_NOT_FOUND on ENOTDIR", async () => {
    const err = new Error("ENOTDIR") as NodeJS.ErrnoException;
    err.code = "ENOTDIR";
    readdirMock.mockRejectedValueOnce(err);
    const result = await readDirectory("file.md", OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
      expect(result.error.message).toContain("Not a directory");
    }
  });

  it("returns empty array for empty directory", async () => {
    readdirMock.mockResolvedValueOnce([]);
    const result = await readDirectory("empty-dir", OPTIONS);
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("returns CLI_ERROR on generic readdir failure", async () => {
    const err = new Error("EPERM: operation not permitted");
    (err as NodeJS.ErrnoException).code = "EPERM";
    readdirMock.mockRejectedValueOnce(err);
    const result = await readDirectory("restricted", OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLI_ERROR");
  });
});

describe("statVirtualFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    realpathMock.mockImplementation((...args: unknown[]) => Promise.resolve(args[0]));
  });

  it("returns file metadata", async () => {
    statMock.mockResolvedValueOnce({
      isDirectory: () => false,
      mtimeMs: 1000,
      ctimeMs: 2000,
      size: 42,
    });
    const result = await statVirtualFile("notes/foo.md", OPTIONS);
    expect(result).toEqual({
      ok: true,
      value: { type: "file", mtime: 1000, ctime: 2000, size: 42 },
    });
  });

  it("returns directory metadata", async () => {
    statMock.mockResolvedValueOnce({
      isDirectory: () => true,
      mtimeMs: 1000,
      ctimeMs: 2000,
      size: 0,
    });
    const result = await statVirtualFile("notes", OPTIONS);
    expect(result).toEqual({
      ok: true,
      value: { type: "directory", mtime: 1000, ctime: 2000, size: 0 },
    });
  });

  it("returns PERMISSION_DENIED on path traversal", async () => {
    const result = await statVirtualFile("../../etc/passwd", OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("returns FILE_NOT_FOUND on ENOENT", async () => {
    realpathMock.mockImplementation((...args: unknown[]) => Promise.resolve(args[0]));
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    statMock.mockRejectedValueOnce(err);
    const result = await statVirtualFile("missing.md", OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });
});
