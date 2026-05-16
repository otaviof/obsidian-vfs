import { beforeEach, describe, expect, it, vi } from "vitest";

import { listFolders, listMarkdownFiles, readDirectory, statVirtualFile } from "./fs-enumeration.js";
import { makeDirent, mockFsFunction } from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
}));

const { readdir, stat, realpath } = await import("node:fs/promises");
const readdirMock = mockFsFunction(readdir);
const statMock = mockFsFunction(stat);
const realpathMock = mockFsFunction(realpath);

const OPTIONS = { vaultRoot: "/vault", allowed: [] as string[], blocked: [] as string[] };

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

  it("enforces allowed on children", async () => {
    const options = { ...OPTIONS, allowed: ["notes"] };
    readdirMock.mockResolvedValueOnce([makeDirent("notes", true), makeDirent("private", true)]);
    const result = await readDirectory(".", options);
    expect(result).toEqual({ ok: true, value: [["notes", "directory"]] });
  });

  it("returns PERMISSION_DENIED for blocked parent", async () => {
    const options = { ...OPTIONS, blocked: ["private"] };
    const result = await readDirectory("private", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
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

  it("returns PERMISSION_DENIED for subdirectory inside blocked folder", async () => {
    const options = { ...OPTIONS, blocked: ["private"] };
    const result = await readDirectory("private/subdir", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("filters blocked children", async () => {
    const options = { ...OPTIONS, blocked: ["notes/draft"] };
    readdirMock.mockResolvedValueOnce([makeDirent("draft", true), makeDirent("public", true)]);
    const result = await readDirectory("notes", options);
    expect(result).toEqual({ ok: true, value: [["public", "directory"]] });
  });
});

describe("listMarkdownFiles", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("enumerates markdown files sorted alphabetically", async () => {
    readdirMock.mockResolvedValueOnce([
      makeDirent("b-note.md", false),
      makeDirent("a-note.md", false),
      makeDirent("image.png", false),
    ]);
    const result = await listMarkdownFiles(OPTIONS);
    expect(result).toEqual({ ok: true, value: ["a-note.md", "b-note.md"] });
  });

  it("skips entries with dot-prefixed path segments", async () => {
    readdirMock.mockResolvedValueOnce([
      makeDirent(".obsidian", true),
      makeDirent("visible.md", false),
    ]);
    const result = await listMarkdownFiles(OPTIONS);
    expect(result).toEqual({ ok: true, value: ["visible.md"] });
  });

  it("searches only allowed when specified", async () => {
    const options = { ...OPTIONS, allowed: ["notes", "docs"] };
    readdirMock
      .mockResolvedValueOnce([makeDirent("intro.md", false)])
      .mockResolvedValueOnce([makeDirent("guide.md", false)]);
    const result = await listMarkdownFiles(options);
    expect(result).toEqual({
      ok: true,
      value: ["docs/guide.md", "notes/intro.md"],
    });
  });

  it("returns empty array for empty vault", async () => {
    readdirMock.mockResolvedValueOnce([]);
    const result = await listMarkdownFiles(OPTIONS);
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("skips unreadable directories", async () => {
    const options = { ...OPTIONS, allowed: ["bad", "good"] };
    readdirMock
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce([makeDirent("note.md", false)]);
    const result = await listMarkdownFiles(options);
    expect(result).toEqual({ ok: true, value: ["good/note.md"] });
  });

  it("handles nested subdirectories", async () => {
    readdirMock
      .mockResolvedValueOnce([makeDirent("sub", true), makeDirent("top.md", false)])
      .mockResolvedValueOnce([makeDirent("deep", true)])
      .mockResolvedValueOnce([makeDirent("note.md", false)]);
    const result = await listMarkdownFiles(OPTIONS);
    expect(result).toEqual({ ok: true, value: ["sub/deep/note.md", "top.md"] });
  });

  it("excludes files in blocked folders", async () => {
    const options = { ...OPTIONS, allowed: ["notes"], blocked: ["notes/draft"] };
    readdirMock
      .mockResolvedValueOnce([makeDirent("public", true), makeDirent("draft", true)])
      .mockResolvedValueOnce([makeDirent("doc.md", false)]);
    const result = await listMarkdownFiles(options);
    expect(result).toEqual({ ok: true, value: ["notes/public/doc.md"] });
  });

  it("excludes blocked files without allowed", async () => {
    const options = { ...OPTIONS, blocked: ["private"] };
    readdirMock
      .mockResolvedValueOnce([makeDirent("notes", true), makeDirent("private", true)])
      .mockResolvedValueOnce([makeDirent("doc.md", false)]);
    const result = await listMarkdownFiles(options);
    expect(result).toEqual({ ok: true, value: ["notes/doc.md"] });
  });

  it("respects depthLimit parameter", async () => {
    readdirMock
      .mockResolvedValueOnce([makeDirent("sub", true), makeDirent("top.md", false)])
      .mockResolvedValueOnce([makeDirent("deep", true), makeDirent("mid.md", false)])
      .mockResolvedValueOnce([makeDirent("bottom.md", false)]);
    const result = await listMarkdownFiles(OPTIONS, 2);
    expect(result).toEqual({ ok: true, value: ["sub/mid.md", "top.md"] });
  });

  it("treats depthLimit 0 as unlimited", async () => {
    readdirMock
      .mockResolvedValueOnce([makeDirent("sub", true)])
      .mockResolvedValueOnce([makeDirent("deep", true)])
      .mockResolvedValueOnce([makeDirent("note.md", false)]);
    const result = await listMarkdownFiles(OPTIONS, 0);
    expect(result).toEqual({ ok: true, value: ["sub/deep/note.md"] });
  });
});

describe("listFolders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("enumerates folders recursively up to depthLimit", async () => {
    readdirMock
      .mockResolvedValueOnce([
        makeDirent("10-projects", true),
        makeDirent("20-areas", true),
        makeDirent("note.md", false),
      ])
      .mockResolvedValueOnce([makeDirent("active", true), makeDirent("archive", true)])
      .mockResolvedValueOnce([]);
    const result = await listFolders(OPTIONS, 2);
    expect(result).toEqual({
      ok: true,
      value: ["10-projects", "10-projects/active", "10-projects/archive", "20-areas"],
    });
  });

  it("depth 1 returns only top-level folders", async () => {
    readdirMock.mockResolvedValueOnce([
      makeDirent("10-projects", true),
      makeDirent("20-areas", true),
      makeDirent("note.md", false),
    ]);
    const result = await listFolders(OPTIONS, 1);
    expect(result).toEqual({
      ok: true,
      value: ["10-projects", "20-areas"],
    });
  });

  it("depth 0 returns unlimited (all folders)", async () => {
    readdirMock
      .mockResolvedValueOnce([makeDirent("a", true)])
      .mockResolvedValueOnce([makeDirent("b", true)])
      .mockResolvedValueOnce([makeDirent("c", true)])
      .mockResolvedValueOnce([]);
    const result = await listFolders(OPTIONS, 0);
    expect(result).toEqual({
      ok: true,
      value: ["a", "a/b", "a/b/c"],
    });
  });

  it("filters dot-prefixed directories", async () => {
    readdirMock.mockResolvedValueOnce([
      makeDirent(".obsidian", true),
      makeDirent(".git", true),
      makeDirent("notes", true),
    ]);
    const result = await listFolders(OPTIONS, 1);
    expect(result).toEqual({ ok: true, value: ["notes"] });
  });

  it("enforces allowed list", async () => {
    const options = { ...OPTIONS, allowed: ["notes"] };
    readdirMock.mockResolvedValueOnce([makeDirent("sub", true)]).mockResolvedValueOnce([]);
    const result = await listFolders(options, 2);
    expect(result).toEqual({ ok: true, value: ["notes", "notes/sub"] });
  });

  it("includes allowed roots themselves", async () => {
    const options = { ...OPTIONS, allowed: ["10-projects", "20-areas"] };
    readdirMock
      .mockResolvedValueOnce([makeDirent("calunga", true)])
      .mockResolvedValueOnce([makeDirent("career", true)]);
    const result = await listFolders(options, 1);
    expect(result).toEqual({
      ok: true,
      value: ["10-projects", "10-projects/calunga", "20-areas", "20-areas/career"],
    });
  });

  it("enforces blocked list", async () => {
    const options = { ...OPTIONS, blocked: ["private"] };
    readdirMock.mockResolvedValueOnce([makeDirent("notes", true), makeDirent("private", true)]);
    const result = await listFolders(options, 1);
    expect(result).toEqual({ ok: true, value: ["notes"] });
  });

  it("skips unreadable directories", async () => {
    const options = { ...OPTIONS, allowed: ["bad", "good"] };
    readdirMock
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce([makeDirent("sub", true)])
      .mockResolvedValueOnce([]);
    const result = await listFolders(options, 2);
    expect(result).toEqual({ ok: true, value: ["bad", "good", "good/sub"] });
  });

  it("returns empty array for empty vault", async () => {
    readdirMock.mockResolvedValueOnce([]);
    const result = await listFolders(OPTIONS, 1);
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("returns sorted results", async () => {
    readdirMock.mockResolvedValueOnce([
      makeDirent("zebra", true),
      makeDirent("alpha", true),
      makeDirent("mid", true),
    ]);
    const result = await listFolders(OPTIONS, 1);
    expect(result).toEqual({ ok: true, value: ["alpha", "mid", "zebra"] });
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
