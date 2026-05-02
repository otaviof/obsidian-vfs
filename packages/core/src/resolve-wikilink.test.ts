import { beforeEach, describe, expect, it, vi } from "vitest";

import { LRUCache } from "./lru-cache.js";
import { resolveWikilink, type ResolveWikilinkOptions } from "./resolve-wikilink.js";
import { mockCLI } from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
}));

const { readdir } = await import("node:fs/promises");
const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);

function makeOptions(overrides: Partial<ResolveWikilinkOptions> = {}): ResolveWikilinkOptions {
  return {
    cli: mockCLI(),
    cache: new LRUCache<string, string>(100),
    vaultRoot: "/vault",
    allowedFolders: [],
    mode: "full",
    ...overrides,
  };
}

describe("resolveWikilink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves via CLI search in full mode", async () => {
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["notes/Project Plan.md"] });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });
    const result = await resolveWikilink("Project Plan", options);
    expect(result).toEqual({ ok: true, value: "notes/Project Plan.md" });
    expect(searchMock).toHaveBeenCalledWith('file:"Project Plan"', { limit: 1 });
  });

  it("caches result and returns from cache on second call", async () => {
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["notes/Note.md"] });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    await resolveWikilink("Note", options);
    searchMock.mockClear();

    const result = await resolveWikilink("Note", options);
    expect(result).toEqual({ ok: true, value: "notes/Note.md" });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("falls back to glob when CLI returns empty", async () => {
    readdirMock.mockResolvedValueOnce(["sub/Note.md"]);
    const options = makeOptions();

    const result = await resolveWikilink("Note", options);
    expect(result).toEqual({ ok: true, value: "sub/Note.md" });
  });

  it("resolves via glob in degraded mode", async () => {
    readdirMock.mockResolvedValueOnce(["folder/My Note.md"]);
    const options = makeOptions({ mode: "degraded" });

    const result = await resolveWikilink("My Note", options);
    expect(result).toEqual({ ok: true, value: "folder/My Note.md" });
  });

  it("respects allowedFolders in glob", async () => {
    readdirMock.mockResolvedValueOnce(["deep/Note.md"]);
    const options = makeOptions({
      mode: "degraded",
      allowedFolders: ["notes"],
    });

    const result = await resolveWikilink("Note", options);
    expect(result).toEqual({ ok: true, value: "notes/deep/Note.md" });
  });

  it("strips .md extension from input", async () => {
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["notes/Note.md"] });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    await resolveWikilink("Note.md", options);
    expect(searchMock).toHaveBeenCalledWith('file:"Note"', { limit: 1 });
  });

  it("trims whitespace from input", async () => {
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["notes/Note.md"] });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    await resolveWikilink("  Note  ", options);
    expect(searchMock).toHaveBeenCalledWith('file:"Note"', { limit: 1 });
  });

  it("returns FILE_NOT_FOUND when no match", async () => {
    readdirMock.mockResolvedValueOnce([]);
    const options = makeOptions();

    const result = await resolveWikilink("Nonexistent", options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
      expect(result.error.message).toContain("Nonexistent");
    }
  });

  it("propagates CLI error", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "CLI_ERROR", message: "CLI failed" },
    });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("Note", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLI_ERROR");
  });

  it("matches case-insensitively in glob", async () => {
    readdirMock.mockResolvedValueOnce(["Project Plan.md"]);
    const options = makeOptions({ mode: "degraded" });

    const result = await resolveWikilink("project plan", options);
    expect(result).toEqual({ ok: true, value: "Project Plan.md" });
  });

  it("returns FILE_NOT_FOUND for empty name", async () => {
    const options = makeOptions();
    const result = await resolveWikilink("", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("skips unreadable directories in glob fallback", async () => {
    readdirMock.mockRejectedValueOnce(new Error("EACCES"));
    const options = makeOptions({ mode: "degraded" });

    const result = await resolveWikilink("Note", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("returns FILE_NOT_FOUND for whitespace-only name", async () => {
    const options = makeOptions();
    const result = await resolveWikilink("   ", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });
});
