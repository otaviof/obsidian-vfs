import { beforeEach, describe, expect, it, vi } from "vitest";

import { readVirtualFile } from "./read-file.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  realpath: vi.fn(),
}));

const { readFile, realpath } = await import("node:fs/promises");
const readFileMock = vi.mocked(readFile as unknown as (...args: unknown[]) => Promise<unknown>);
const realpathMock = vi.mocked(realpath as unknown as (...args: unknown[]) => Promise<unknown>);

describe("readVirtualFile", () => {
  const options = { vaultRoot: "/vault", allowedFolders: [] as string[] };

  beforeEach(() => {
    vi.clearAllMocks();
    realpathMock.mockImplementation((...args: unknown[]) => Promise.resolve(args[0]));
  });

  it("reads file successfully", async () => {
    readFileMock.mockResolvedValue(Buffer.from("hello"));
    const result = await readVirtualFile("notes/foo.md", options);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new TextDecoder().decode(result.value)).toBe("hello");
    }
  });

  it("rejects path traversal without calling readFile", async () => {
    const result = await readVirtualFile("../../etc/passwd", options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("rejects allowedFolders violation", async () => {
    const result = await readVirtualFile("private/secret.md", {
      vaultRoot: "/vault",
      allowedFolders: ["notes"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("maps ENOENT to FILE_NOT_FOUND", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    readFileMock.mockRejectedValue(enoent);
    const result = await readVirtualFile("notes/missing.md", options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
    }
  });

  it("maps EACCES to PERMISSION_DENIED", async () => {
    const eacces = new Error("EACCES") as NodeJS.ErrnoException;
    eacces.code = "EACCES";
    readFileMock.mockRejectedValue(eacces);
    const result = await readVirtualFile("notes/locked.md", options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("maps generic read error to CLI_ERROR", async () => {
    readFileMock.mockRejectedValue(new Error("disk error"));
    const result = await readVirtualFile("notes/bad.md", options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CLI_ERROR");
    }
  });

  it("calls readFile without encoding", async () => {
    readFileMock.mockResolvedValue(Buffer.from("content"));
    await readVirtualFile("notes/foo.md", options);
    expect(readFileMock).toHaveBeenCalledWith("/vault/notes/foo.md");
  });
});
