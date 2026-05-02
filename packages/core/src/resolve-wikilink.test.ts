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
    expect(result).toEqual({ ok: true, value: "docs/overview.md" });
    expect(searchMock).toHaveBeenCalledWith("file:overview");
  });

  it("picks exact basename match from multiple search results", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      ok: true,
      value: [
        "archive/legacy/overview-draft.md",
        "docs/overview.md",
        "ref/overview-v2.md",
      ],
    });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("overview", options);
    expect(result).toEqual({ ok: true, value: "docs/overview.md" });
  });

  it("prefers shortest path when multiple exact basename matches exist", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      ok: true,
      value: ["deep/nested/folder/readme.md", "docs/readme.md"],
    });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("readme", options);
    expect(result).toEqual({ ok: true, value: "docs/readme.md" });
  });

  it("falls back to glob when no exact basename match in search results", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      ok: true,
      value: ["archive/setup-guide.md"],
    });
    readdirMock.mockResolvedValueOnce(["sub/setup.md"]);
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("setup", options);
    expect(result).toEqual({ ok: true, value: "sub/setup.md" });
  });

  it("caches result and returns from cache on second call", async () => {
    const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["docs/config.md"] });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    await resolveWikilink("config", options);
    searchMock.mockClear();

    const result = await resolveWikilink("config", options);
    expect(result).toEqual({ ok: true, value: "docs/config.md" });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("falls back to glob when CLI returns empty", async () => {
    readdirMock.mockResolvedValueOnce(["sub/deploy.md"]);
    const options = makeOptions();

    const result = await resolveWikilink("deploy", options);
    expect(result).toEqual({ ok: true, value: "sub/deploy.md" });
  });

  it("resolves via glob in degraded mode", async () => {
    readdirMock.mockResolvedValueOnce(["folder/getting-started.md"]);
    const options = makeOptions({ mode: "degraded" });

    const result = await resolveWikilink("getting-started", options);
    expect(result).toEqual({ ok: true, value: "folder/getting-started.md" });
  });

  it("respects allowedFolders in glob", async () => {
    readdirMock.mockResolvedValueOnce(["deep/changelog.md"]);
    const options = makeOptions({
      mode: "degraded",
      allowedFolders: ["notes"],
    });

    const result = await resolveWikilink("changelog", options);
    expect(result).toEqual({ ok: true, value: "notes/deep/changelog.md" });
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

  it("propagates CLI error", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "CLI_ERROR", message: "CLI failed" },
    });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("target", options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLI_ERROR");
  });

  it("matches case-insensitively in glob", async () => {
    readdirMock.mockResolvedValueOnce(["Roadmap.md"]);
    const options = makeOptions({ mode: "degraded" });

    const result = await resolveWikilink("roadmap", options);
    expect(result).toEqual({ ok: true, value: "Roadmap.md" });
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

  it("matches basename case-insensitively in search results", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      ok: true,
      value: ["docs/Changelog.md"],
    });
    const options = makeOptions({ cli: mockCLI({ search: searchMock }) });

    const result = await resolveWikilink("changelog", options);
    expect(result).toEqual({ ok: true, value: "docs/Changelog.md" });
  });
});
