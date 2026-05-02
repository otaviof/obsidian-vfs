import { describe, expect, it } from "vitest";

import { processContent, scrubWikilinks, sliceContent } from "./content-slice.js";

describe("sliceContent", () => {
  it("extracts heading section up to next equal-depth heading", () => {
    const md = "## Design\nContent here\n## Next";
    const result = sliceContent(md, "Design");
    expect(result).toEqual({ ok: true, value: "## Design\nContent here" });
  });

  it("includes nested headings", () => {
    const md = "## Design\n### Sub\nText\n## Next";
    const result = sliceContent(md, "Design");
    expect(result).toEqual({ ok: true, value: "## Design\n### Sub\nText" });
  });

  it("extracts to EOF when no next heading", () => {
    const md = "## Design\nContent";
    const result = sliceContent(md, "Design");
    expect(result).toEqual({ ok: true, value: "## Design\nContent" });
  });

  it("matches case-insensitively", () => {
    const md = "## Design\nContent\n## Other";
    const result = sliceContent(md, "design");
    expect(result).toEqual({ ok: true, value: "## Design\nContent" });
  });

  it("trims heading text for matching", () => {
    const md = "##   Design  \nContent\n## Other";
    const result = sliceContent(md, "Design");
    expect(result).toEqual({ ok: true, value: "##   Design  \nContent" });
  });

  it("returns FILE_NOT_FOUND on missing heading", () => {
    const md = "## Design\nContent";
    const result = sliceContent(md, "Missing");
    expect(result).toEqual({
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "Section not found: Missing" },
    });
  });

  it("handles level 1 heading", () => {
    const md = "# Top\nText\n# Other";
    const result = sliceContent(md, "Top");
    expect(result).toEqual({ ok: true, value: "# Top\nText" });
  });

  it("handles level 6 heading", () => {
    const md = "###### Deep\nContent";
    const result = sliceContent(md, "Deep");
    expect(result).toEqual({ ok: true, value: "###### Deep\nContent" });
  });

  it("returns FILE_NOT_FOUND on empty content", () => {
    const result = sliceContent("", "Design");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("stops at higher-level heading", () => {
    const md = "### Sub\nText\n## Parent\nMore";
    const result = sliceContent(md, "Sub");
    expect(result).toEqual({ ok: true, value: "### Sub\nText" });
  });

  it("trims trailing whitespace from result", () => {
    const md = "## Design\nContent\n\n\n## Next";
    const result = sliceContent(md, "Design");
    expect(result).toEqual({ ok: true, value: "## Design\nContent" });
  });
});

describe("scrubWikilinks", () => {
  it("replaces simple wikilink", () => {
    const result = scrubWikilinks("See [[Note]]", "vault");
    expect(result).toBe("See [Note](obs://vault/Note)");
  });

  it("replaces aliased wikilink", () => {
    const result = scrubWikilinks("See [[Note|Display]]", "vault");
    expect(result).toBe("See [Display](obs://vault/Note)");
  });

  it("replaces multiple wikilinks", () => {
    const result = scrubWikilinks("[[A]] and [[B]]", "vault");
    expect(result).toBe("[A](obs://vault/A) and [B](obs://vault/B)");
  });

  it("preserves non-wikilink text", () => {
    const result = scrubWikilinks("Regular text", "vault");
    expect(result).toBe("Regular text");
  });

  it("encodes special characters in URI", () => {
    const result = scrubWikilinks("[[My Note]]", "vault");
    expect(result).toBe("[My Note](obs://vault/My%20Note)");
  });

  it("encodes vault name with spaces", () => {
    const result = scrubWikilinks("[[Note]]", "My Vault");
    expect(result).toBe("[Note](obs://My%20Vault/Note)");
  });
});

describe("processContent", () => {
  it("returns content unchanged with no options", () => {
    const result = processContent("Hello", {});
    expect(result).toEqual({ ok: true, value: "Hello" });
  });

  it("applies section slicing only", () => {
    const md = "## Design\nContent\n## Other";
    const result = processContent(md, { section: "Design" });
    expect(result).toEqual({ ok: true, value: "## Design\nContent" });
  });

  it("applies scrubbing only", () => {
    const result = processContent("See [[Note]]", { scrubWikilinks: true, vaultName: "vault" });
    expect(result).toEqual({ ok: true, value: "See [Note](obs://vault/Note)" });
  });

  it("applies slicing then scrubbing", () => {
    const md = "## Design\nSee [[Note]]\n## Other";
    const result = processContent(md, {
      section: "Design",
      scrubWikilinks: true,
      vaultName: "vault",
    });
    expect(result).toEqual({ ok: true, value: "## Design\nSee [Note](obs://vault/Note)" });
  });

  it("returns error when section not found", () => {
    const result = processContent("## Design\nContent", { section: "Missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("returns INVALID_URI when scrubbing without vaultName", () => {
    const result = processContent("[[Note]]", { scrubWikilinks: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });
});
