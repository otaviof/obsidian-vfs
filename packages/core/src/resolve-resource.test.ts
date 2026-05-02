import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveResource, resolveSkillResource } from "./resolve-resource.js";

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  realpath: vi.fn(),
}));

const { access } = await import("node:fs/promises");
const accessMock = vi.mocked(access as unknown as (...args: unknown[]) => Promise<unknown>);

const SECURITY_OPTIONS = { vaultRoot: "/vault", allowedFolders: [] as string[] };

describe("resolveResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds resource in first directory", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const result = await resolveResource("architect", ["agents"], SECURITY_OPTIONS);
    expect(result).toEqual({ ok: true, value: "agents/architect.md" });
  });

  it("falls through to second directory when absent from first", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    accessMock.mockRejectedValueOnce(enoent);
    accessMock.mockResolvedValueOnce(undefined);
    const result = await resolveResource("architect", ["dir1", "dir2"], SECURITY_OPTIONS);
    expect(result).toEqual({ ok: true, value: "dir2/architect.md" });
  });

  it("adds .md extension automatically", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    await resolveResource("architect", ["agents"], SECURITY_OPTIONS);
    expect(accessMock).toHaveBeenCalledWith("/vault/agents/architect.md");
  });

  it("does not double .md extension", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    await resolveResource("architect.md", ["agents"], SECURITY_OPTIONS);
    expect(accessMock).toHaveBeenCalledWith("/vault/agents/architect.md");
  });

  it("returns FILE_NOT_FOUND if all dirs exhausted", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    accessMock.mockRejectedValue(enoent);
    const result = await resolveResource("missing", ["dir1", "dir2"], SECURITY_OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("returns FILE_NOT_FOUND when dirs array is empty", async () => {
    const result = await resolveResource("anything", [], SECURITY_OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("skips directory outside vault root", async () => {
    const result = await resolveResource("evil", ["../../outside"], SECURITY_OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("skips directory outside allowedFolders", async () => {
    const options = { vaultRoot: "/vault", allowedFolders: ["notes"] };
    const result = await resolveResource("item", ["private"], options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("trims name whitespace", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const result = await resolveResource("  architect  ", ["agents"], SECURITY_OPTIONS);
    expect(result).toEqual({ ok: true, value: "agents/architect.md" });
  });
});

describe("resolveSkillResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds skill as name/SKILL.md in first directory", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const result = await resolveSkillResource("obsidian", ["skills"], SECURITY_OPTIONS);
    expect(result).toEqual({ ok: true, value: "skills/obsidian/SKILL.md" });
  });

  it("checks the correct physical path", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    await resolveSkillResource("obsidian", ["skills"], SECURITY_OPTIONS);
    expect(accessMock).toHaveBeenCalledWith("/vault/skills/obsidian/SKILL.md");
  });

  it("falls through to second directory when absent from first", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    accessMock.mockRejectedValueOnce(enoent);
    accessMock.mockResolvedValueOnce(undefined);
    const result = await resolveSkillResource("obsidian", ["dir1", "dir2"], SECURITY_OPTIONS);
    expect(result).toEqual({ ok: true, value: "dir2/obsidian/SKILL.md" });
  });

  it("does not append .md to skill name", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    await resolveSkillResource("my-skill", ["skills"], SECURITY_OPTIONS);
    expect(accessMock).toHaveBeenCalledWith("/vault/skills/my-skill/SKILL.md");
  });

  it("returns FILE_NOT_FOUND if all dirs exhausted", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    accessMock.mockRejectedValue(enoent);
    const result = await resolveSkillResource("missing", ["dir1", "dir2"], SECURITY_OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("returns FILE_NOT_FOUND when dirs array is empty", async () => {
    const result = await resolveSkillResource("anything", [], SECURITY_OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("skips directory outside vault root", async () => {
    const result = await resolveSkillResource("evil", ["../../outside"], SECURITY_OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("skips directory outside allowedFolders", async () => {
    const options = { vaultRoot: "/vault", allowedFolders: ["notes"] };
    const result = await resolveSkillResource("item", ["private"], options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("treats name with .md as literal directory name", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    await resolveSkillResource("obsidian.md", ["skills"], SECURITY_OPTIONS);
    expect(accessMock).toHaveBeenCalledWith("/vault/skills/obsidian.md/SKILL.md");
  });

  it("trims name whitespace", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const result = await resolveSkillResource("  obsidian  ", ["skills"], SECURITY_OPTIONS);
    expect(result).toEqual({ ok: true, value: "skills/obsidian/SKILL.md" });
  });
});
