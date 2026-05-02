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
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["docs/overview.md"] });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });
    const result = await resolveWikilink("overview", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "docs/overview.md", candidates: ["docs/overview.md"] },
    });
    expect(searchMock).toHaveBeenCalledWith("file:overview");
  });

  it("picks exact basename match from multiple search results", async () => {
    const candidates = [
      "archive/legacy/overview-draft.md",
      "docs/overview.md",
      "ref/overview-v2.md",
    ];
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: candidates });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("overview", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "docs/overview.md", candidates },
    });
  });

  it("prefers shortest path when multiple exact basename matches exist", async () => {
    const candidates = ["deep/nested/folder/readme.md", "docs/readme.md"];
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: candidates });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("readme", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "docs/readme.md", candidates },
    });
  });

  it("falls back to glob when no exact basename match in search results", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      ok: true,
      value: ["archive/setup-guide.md"],
    });
    readdirMock.mockResolvedValueOnce(["sub/setup.md"]);
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("setup", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "sub/setup.md", candidates: [] },
    });
  });

  it("caches result and returns from cache on second call", async () => {
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["docs/config.md"] });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    await resolveWikilink("config", options);
    searchMock.mockClear();

    const result = await resolveWikilink("config", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "docs/config.md", candidates: [] },
    });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("falls back to glob when CLI returns empty", async () => {
    readdirMock.mockResolvedValueOnce(["sub/deploy.md"]);
    const options = makeOptions();

    const result = await resolveWikilink("deploy", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "sub/deploy.md", candidates: [] },
    });
  });

  it("resolves via glob in degraded mode", async () => {
    readdirMock.mockResolvedValueOnce(["folder/getting-started.md"]);
    const options = makeOptions({ mode: "degraded" });

    const result = await resolveWikilink("getting-started", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "folder/getting-started.md", candidates: [] },
    });
  });

  it("respects allowedFolders in glob", async () => {
    readdirMock.mockResolvedValueOnce(["deep/changelog.md"]);
    const options = makeOptions({
      mode: "degraded",
      allowedFolders: ["notes"],
    });

    const result = await resolveWikilink("changelog", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "notes/deep/changelog.md", candidates: [] },
    });
  });

  it("strips .md extension from input", async () => {
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["docs/faq.md"] });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    await resolveWikilink("faq.md", options);
    expect(searchMock).toHaveBeenCalledWith("file:faq");
  });

  it("trims whitespace from input", async () => {
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["docs/glossary.md"] });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    await resolveWikilink("  glossary  ", options);
    expect(searchMock).toHaveBeenCalledWith("file:glossary");
  });

  it("returns FILE_NOT_FOUND when no match", async () => {
    readdirMock.mockResolvedValueOnce([]);
    const options = makeOptions();

    const result = await resolveWikilink("nonexistent", options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
      expect(result.error.message).toContain("nonexistent");
    }
  });

  it("falls through to glob on CLI search error", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "CLI_ERROR", message: "CLI failed" },
    });
    readdirMock.mockResolvedValueOnce(["sub/target.md"]);
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("target", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "sub/target.md", candidates: [] },
    });
  });

  it("matches case-insensitively in glob", async () => {
    readdirMock.mockResolvedValueOnce(["Roadmap.md"]);
    const options = makeOptions({ mode: "degraded" });

    const result = await resolveWikilink("roadmap", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "Roadmap.md", candidates: [] },
    });
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

    const result = await resolveWikilink("target", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("returns FILE_NOT_FOUND for whitespace-only name", async () => {
    const options = makeOptions();
    const result = await resolveWikilink("   ", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("returns path-based wikilink directly without search", async () => {
    const searchMock = vi.fn();
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("80-system/system.md", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "80-system/system.md", candidates: [] },
    });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("appends .md to path-based wikilink without extension", async () => {
    const options = makeOptions();
    const result = await resolveWikilink("folder/note", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "folder/note.md", candidates: [] },
    });
  });

  it("rejects path traversal in path-based wikilink", async () => {
    const options = makeOptions();
    const result = await resolveWikilink("../../etc/passwd", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("matches basename case-insensitively in search results", async () => {
    const candidates = ["docs/Changelog.md"];
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: candidates });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("changelog", options);
    expect(result).toEqual({
      ok: true,
      value: { resolvedPath: "docs/Changelog.md", candidates },
    });
  });
});
