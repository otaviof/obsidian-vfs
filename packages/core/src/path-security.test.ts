import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canonicalizePath,
  checkAllowedFolder,
  checkSymlink,
  validatePath,
} from "./path-security.js";
import { mockFsFunction } from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  realpath: vi.fn(),
}));

const { realpath } = await import("node:fs/promises");
const realpathMock = mockFsFunction(realpath);

describe("canonicalizePath", () => {
  const vaultRoot = "/vault";

  it("resolves simple path within vault", () => {
    const result = canonicalizePath("notes/foo.md", vaultRoot);
    expect(result).toEqual({ ok: true, value: "/vault/notes/foo.md" });
  });

  it("rejects path traversal with ..", () => {
    const result = canonicalizePath("../../etc/passwd", vaultRoot);
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path resolves outside vault root" },
    });
  });

  it("accepts absolute path within vault", () => {
    const result = canonicalizePath("/vault/notes/foo.md", vaultRoot);
    expect(result).toEqual({ ok: true, value: "/vault/notes/foo.md" });
  });

  it("rejects absolute path outside vault", () => {
    const result = canonicalizePath("/etc/passwd", vaultRoot);
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path resolves outside vault root" },
    });
  });

  it("accepts path equal to vault root", () => {
    const result = canonicalizePath(".", vaultRoot);
    expect(result).toEqual({ ok: true, value: "/vault" });
  });
});

describe("checkAllowedFolder", () => {
  it("passes through when allowedFolders is empty", () => {
    const result = checkAllowedFolder("/vault/any/path.md", {
      vaultRoot: "/vault",
      allowedFolders: [],
    });
    expect(result).toEqual({ ok: true, value: "/vault/any/path.md" });
  });

  it("accepts path within allowed folder", () => {
    const result = checkAllowedFolder("/vault/notes/foo.md", {
      vaultRoot: "/vault",
      allowedFolders: ["notes"],
    });
    expect(result).toEqual({ ok: true, value: "/vault/notes/foo.md" });
  });

  it("rejects path outside all allowed folders", () => {
    const result = checkAllowedFolder("/vault/private/secret.md", {
      vaultRoot: "/vault",
      allowedFolders: ["notes", "agents"],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path not within allowed folders" },
    });
  });

  it("accepts path in second allowed folder", () => {
    const result = checkAllowedFolder("/vault/agents/bot.md", {
      vaultRoot: "/vault",
      allowedFolders: ["notes", "agents"],
    });
    expect(result).toEqual({ ok: true, value: "/vault/agents/bot.md" });
  });

  it("accepts path within nested allowed folder", () => {
    const result = checkAllowedFolder("/vault/projects/active/todo.md", {
      vaultRoot: "/vault",
      allowedFolders: ["projects/active"],
    });
    expect(result).toEqual({ ok: true, value: "/vault/projects/active/todo.md" });
  });
});

describe("checkSymlink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts path when realpath stays within vault", async () => {
    realpathMock.mockResolvedValue("/vault/notes/foo.md");
    const result = await checkSymlink("/vault/notes/foo.md", "/vault");
    expect(result).toEqual({ ok: true, value: "/vault/notes/foo.md" });
  });

  it("rejects symlink escaping vault", async () => {
    realpathMock.mockResolvedValue("/outside/secret.md");
    const result = await checkSymlink("/vault/link.md", "/vault");
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Symlink resolves outside vault root" },
    });
  });

  it("returns PERMISSION_DENIED for non-ENOENT filesystem errors", async () => {
    const eacces = new Error("EACCES") as NodeJS.ErrnoException;
    eacces.code = "EACCES";
    realpathMock.mockRejectedValue(eacces);
    const result = await checkSymlink("/vault/locked.md", "/vault");
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Cannot resolve path: /vault/locked.md" },
    });
  });

  it("returns FILE_NOT_FOUND for non-existent path", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    realpathMock.mockRejectedValue(enoent);
    const result = await checkSymlink("/vault/missing.md", "/vault");
    expect(result).toEqual({
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "File does not exist: /vault/missing.md" },
    });
  });
});

describe("validatePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validated path when all checks pass", async () => {
    realpathMock.mockResolvedValue("/vault/notes/foo.md");
    const result = await validatePath("notes/foo.md", {
      vaultRoot: "/vault",
      allowedFolders: [],
    });
    expect(result).toEqual({ ok: true, value: "/vault/notes/foo.md" });
  });

  it("fails on path traversal", async () => {
    const result = await validatePath("../../etc/passwd", {
      vaultRoot: "/vault",
      allowedFolders: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(realpathMock).not.toHaveBeenCalled();
  });

  it("fails on allowedFolder violation", async () => {
    const result = await validatePath("private/secret.md", {
      vaultRoot: "/vault",
      allowedFolders: ["notes"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(realpathMock).not.toHaveBeenCalled();
  });

  it("fails on symlink escape", async () => {
    realpathMock.mockResolvedValue("/outside/secret.md");
    const result = await validatePath("link.md", {
      vaultRoot: "/vault",
      allowedFolders: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });
});
