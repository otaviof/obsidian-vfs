import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canonicalizePath,
  checkAllowedFolder,
  checkBlockedFolder,
  checkSymlink,
  isAllowedPath,
  validatePath,
  validatePathForWrite,
} from "./path-security.js";
import { mockFsFunction } from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  realpath: vi.fn(),
}));

const { realpath } = await import("node:fs/promises");
const realpathMock = mockFsFunction(realpath);

const EMPTY_OPTS = { vaultRoot: "/vault", allowed: [] as string[], blocked: [] as string[] };

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

describe("checkBlockedFolder", () => {
  it("passes through when blocked is empty", () => {
    const result = checkBlockedFolder("/vault/any/path.md", EMPTY_OPTS);
    expect(result).toEqual({ ok: true, value: "/vault/any/path.md" });
  });

  it("rejects path within blocked folder", () => {
    const result = checkBlockedFolder("/vault/private/secret.md", {
      ...EMPTY_OPTS,
      blocked: ["private"],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path within blocked folders" },
    });
  });

  it("rejects path equal to blocked folder", () => {
    const result = checkBlockedFolder("/vault/private", {
      ...EMPTY_OPTS,
      blocked: ["private"],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path within blocked folders" },
    });
  });

  it("accepts path outside blocked folders", () => {
    const result = checkBlockedFolder("/vault/notes/foo.md", {
      ...EMPTY_OPTS,
      blocked: ["private"],
    });
    expect(result).toEqual({ ok: true, value: "/vault/notes/foo.md" });
  });

  it("rejects nested path within blocked folder", () => {
    const result = checkBlockedFolder("/vault/notes/draft/wip.md", {
      ...EMPTY_OPTS,
      blocked: ["notes/draft"],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path within blocked folders" },
    });
  });

  it("handles overlapping blocked entries", () => {
    const result = checkBlockedFolder("/vault/notes/draft/nested/file.md", {
      ...EMPTY_OPTS,
      blocked: ["notes", "notes/draft"],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path within blocked folders" },
    });
  });
});

describe("checkAllowedFolder", () => {
  it("passes through when allowed is empty and blocked is empty", () => {
    const result = checkAllowedFolder("/vault/any/path.md", EMPTY_OPTS);
    expect(result).toEqual({ ok: true, value: "/vault/any/path.md" });
  });

  it("accepts path within allowed folder", () => {
    const result = checkAllowedFolder("/vault/notes/foo.md", {
      ...EMPTY_OPTS,
      allowed: ["notes"],
    });
    expect(result).toEqual({ ok: true, value: "/vault/notes/foo.md" });
  });

  it("rejects path outside all allowed folders", () => {
    const result = checkAllowedFolder("/vault/private/secret.md", {
      ...EMPTY_OPTS,
      allowed: ["notes", "agents"],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path not within allowed folders" },
    });
  });

  it("accepts path in second allowed folder", () => {
    const result = checkAllowedFolder("/vault/agents/bot.md", {
      ...EMPTY_OPTS,
      allowed: ["notes", "agents"],
    });
    expect(result).toEqual({ ok: true, value: "/vault/agents/bot.md" });
  });

  it("accepts path within nested allowed folder", () => {
    const result = checkAllowedFolder("/vault/projects/active/todo.md", {
      ...EMPTY_OPTS,
      allowed: ["projects/active"],
    });
    expect(result).toEqual({ ok: true, value: "/vault/projects/active/todo.md" });
  });

  it("accepts vault root when allowed is non-empty", () => {
    const result = checkAllowedFolder("/vault", {
      ...EMPTY_OPTS,
      allowed: ["notes", "agents"],
    });
    expect(result).toEqual({ ok: true, value: "/vault" });
  });

  it("accepts vault root when blocked entries exist", () => {
    const result = checkAllowedFolder("/vault", {
      ...EMPTY_OPTS,
      blocked: ["private", "notes/draft"],
    });
    expect(result).toEqual({ ok: true, value: "/vault" });
  });

  it("accepts intermediate ancestor of allowed folder", () => {
    const result = checkAllowedFolder("/vault/projects", {
      ...EMPTY_OPTS,
      allowed: ["projects/active"],
    });
    expect(result).toEqual({ ok: true, value: "/vault/projects" });
  });

  it("blocked takes precedence over allowed", () => {
    const result = checkAllowedFolder("/vault/notes/draft/wip.md", {
      ...EMPTY_OPTS,
      allowed: ["notes"],
      blocked: ["notes/draft"],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path within blocked folders" },
    });
  });

  it("accepts allowed path not in blocked", () => {
    const result = checkAllowedFolder("/vault/notes/public/doc.md", {
      ...EMPTY_OPTS,
      allowed: ["notes"],
      blocked: ["notes/draft"],
    });
    expect(result).toEqual({ ok: true, value: "/vault/notes/public/doc.md" });
  });
});

describe("isAllowedPath", () => {
  it("returns true for path within allowed", () => {
    expect(isAllowedPath("notes/foo.md", { ...EMPTY_OPTS, allowed: ["notes"] })).toBe(true);
  });

  it("returns false for path outside allowed", () => {
    expect(isAllowedPath("private/secret.md", { ...EMPTY_OPTS, allowed: ["notes"] })).toBe(false);
  });

  it("returns false for path within blocked", () => {
    expect(isAllowedPath("notes/draft/wip.md", { ...EMPTY_OPTS, blocked: ["notes/draft"] })).toBe(
      false,
    );
  });

  it("returns true for unrestricted config", () => {
    expect(isAllowedPath("anything/here.md", EMPTY_OPTS)).toBe(true);
  });

  it("returns false for traversal path", () => {
    expect(isAllowedPath("../../etc/passwd", EMPTY_OPTS)).toBe(false);
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
    const result = await validatePath("notes/foo.md", EMPTY_OPTS);
    expect(result).toEqual({ ok: true, value: "/vault/notes/foo.md" });
  });

  it("fails on path traversal", async () => {
    const result = await validatePath("../../etc/passwd", EMPTY_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(realpathMock).not.toHaveBeenCalled();
  });

  it("fails on allowed violation", async () => {
    const result = await validatePath("private/secret.md", {
      ...EMPTY_OPTS,
      allowed: ["notes"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(realpathMock).not.toHaveBeenCalled();
  });

  it("fails on blocked violation", async () => {
    const result = await validatePath("notes/draft/wip.md", {
      ...EMPTY_OPTS,
      blocked: ["notes/draft"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(realpathMock).not.toHaveBeenCalled();
  });

  it("fails on symlink escape", async () => {
    realpathMock.mockResolvedValue("/outside/secret.md");
    const result = await validatePath("link.md", EMPTY_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });
});

describe("validatePathForWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validated path when file exists", async () => {
    realpathMock.mockResolvedValue("/vault/notes/foo.md");
    const result = await validatePathForWrite("notes/foo.md", EMPTY_OPTS);
    expect(result).toEqual({ ok: true, value: "/vault/notes/foo.md" });
  });

  it("succeeds for non-existent file in existing directory", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    realpathMock
      .mockRejectedValueOnce(enoent) // /vault/notes/new.md does not exist
      .mockResolvedValueOnce("/vault/notes"); // /vault/notes exists
    const result = await validatePathForWrite("notes/new.md", EMPTY_OPTS);
    expect(result).toEqual({ ok: true, value: "/vault/notes/new.md" });
  });

  it("succeeds for non-existent nested directories", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    realpathMock
      .mockRejectedValueOnce(enoent) // /vault/a/b/c.md
      .mockRejectedValueOnce(enoent) // /vault/a/b
      .mockRejectedValueOnce(enoent) // /vault/a
      .mockResolvedValueOnce("/vault"); // /vault exists
    const result = await validatePathForWrite("a/b/c.md", EMPTY_OPTS);
    expect(result).toEqual({ ok: true, value: "/vault/a/b/c.md" });
  });

  it("fails on symlink escape in ancestor", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    realpathMock
      .mockRejectedValueOnce(enoent) // /vault/link/new.md
      .mockResolvedValueOnce("/outside"); // /vault/link resolves outside
    const result = await validatePathForWrite("link/new.md", EMPTY_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("fails on path traversal", async () => {
    const result = await validatePathForWrite("../../etc/passwd", EMPTY_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(realpathMock).not.toHaveBeenCalled();
  });

  it("fails on blocked folder", async () => {
    const result = await validatePathForWrite("private/new.md", {
      ...EMPTY_OPTS,
      blocked: ["private"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(realpathMock).not.toHaveBeenCalled();
  });

  it("fails on allowed folder violation", async () => {
    const result = await validatePathForWrite("other/new.md", {
      ...EMPTY_OPTS,
      allowed: ["notes"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(realpathMock).not.toHaveBeenCalled();
  });

  it("returns canonicalized path, not realpath of ancestor", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    realpathMock.mockRejectedValueOnce(enoent).mockResolvedValueOnce("/vault/notes");
    const result = await validatePathForWrite("notes/new.md", EMPTY_OPTS);
    expect(result).toEqual({ ok: true, value: "/vault/notes/new.md" });
  });
});
