import { describe, expect, it, vi } from "vitest";

import {
  classifyInput,
  normalizeWikilink,
  parseMarkdownLinks,
  resolveEmbeds,
} from "./markdown-links.js";
import type { EmbedResolver } from "./markdown-links.js";

describe("parseMarkdownLinks", () => {
  it("parses simple wikilinks", () => {
    const links = parseMarkdownLinks("See [[Note]] here");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      kind: "wikilink",
      target: "Note",
      section: undefined,
      display: undefined,
    });
  });

  it("parses wikilink with alias", () => {
    const links = parseMarkdownLinks("See [[Note|Display Text]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      kind: "wikilink",
      target: "Note",
      display: "Display Text",
    });
  });

  it("parses wikilink with section", () => {
    const links = parseMarkdownLinks("See [[Note#Heading]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      kind: "wikilink",
      target: "Note",
      section: "Heading",
    });
  });

  it("parses wikilink with section and alias", () => {
    const links = parseMarkdownLinks("See [[Note#Heading|My Link]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      kind: "wikilink",
      target: "Note",
      section: "Heading",
      display: "My Link",
    });
  });

  it("parses embed as kind embed", () => {
    const links = parseMarkdownLinks("![[Embedded Note]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      kind: "embed",
      target: "Embedded Note",
    });
  });

  it("parses embed with section", () => {
    const links = parseMarkdownLinks("![[Note#Section]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      kind: "embed",
      target: "Note",
      section: "Section",
    });
  });

  it("excludes links inside fenced code blocks", () => {
    const md = "```\n[[Inside Code]]\n```\n[[Outside]]";
    const links = parseMarkdownLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Outside");
  });

  it("excludes links inside inline code spans", () => {
    const md = "Use `[[Code]]` but also [[Real]]";
    const links = parseMarkdownLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Real");
  });

  it("returns correct startIndex and endIndex", () => {
    const md = "Before [[Target]] after";
    const links = parseMarkdownLinks(md);
    expect(links[0].startIndex).toBe(7);
    expect(links[0].endIndex).toBe(17);
  });

  it("returns correct startIndex for embeds (includes !)", () => {
    const md = "Before ![[Embed]] after";
    const links = parseMarkdownLinks(md);
    expect(links[0].startIndex).toBe(7);
    expect(links[0].endIndex).toBe(17);
  });

  it("handles multiple links on same line", () => {
    const md = "[[A]] and [[B]] and [[C]]";
    const links = parseMarkdownLinks(md);
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.target)).toEqual(["A", "B", "C"]);
  });

  it("returns empty array for text with no links", () => {
    expect(parseMarkdownLinks("No links here")).toEqual([]);
  });

  it("handles wikilink with folder path", () => {
    const links = parseMarkdownLinks("[[folder/Note]]");
    expect(links[0].target).toBe("folder/Note");
  });

  it("handles tilde-fenced code blocks", () => {
    const md = "~~~\n[[Inside]]\n~~~\n[[Outside]]";
    const links = parseMarkdownLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Outside");
  });

  it("handles nested backticks in code spans correctly", () => {
    const md = "`code with [[fake]]` and [[real]]";
    const links = parseMarkdownLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("real");
  });

  it("handles empty section in wikilink", () => {
    const links = parseMarkdownLinks("[[Note#]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      target: "Note",
      section: undefined,
    });
  });

  it("handles empty display text in wikilink", () => {
    const links = parseMarkdownLinks("[[Note|]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      target: "Note",
      display: undefined,
    });
  });

  it("handles embed at start of document", () => {
    const links = parseMarkdownLinks("![[First]]");
    expect(links[0]).toMatchObject({
      kind: "embed",
      startIndex: 0,
      endIndex: 10,
    });
  });

  it("handles consecutive embeds", () => {
    const links = parseMarkdownLinks("![[A]]![[B]]");
    expect(links).toHaveLength(2);
    expect(links[0].kind).toBe("embed");
    expect(links[1].kind).toBe("embed");
  });

  it("handles mixed wikilinks and embeds", () => {
    const links = parseMarkdownLinks("[[Link]] and ![[Embed]]");
    expect(links).toHaveLength(2);
    expect(links[0].kind).toBe("wikilink");
    expect(links[1].kind).toBe("embed");
  });

  it("handles code fence with language specifier", () => {
    const md = "```typescript\n[[InCode]]\n```\n[[Outside]]";
    const links = parseMarkdownLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Outside");
  });

  it("handles longer tilde fences", () => {
    const md = "~~~~\n[[Inside]]\n~~~~\n[[Outside]]";
    const links = parseMarkdownLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Outside");
  });
});

describe("normalizeWikilink", () => {
  it("strips double brackets", () => {
    expect(normalizeWikilink("[[Note]]")).toBe("Note");
  });

  it("strips alias", () => {
    expect(normalizeWikilink("[[Note|Display]]")).toBe("Note");
  });

  it("trims whitespace", () => {
    expect(normalizeWikilink("  Note  ")).toBe("Note");
  });

  it("passes through bare names", () => {
    expect(normalizeWikilink("Note")).toBe("Note");
  });

  it("handles brackets with pipe and whitespace", () => {
    expect(normalizeWikilink("  [[Note | Alias]]  ")).toBe("Note");
  });

  it("handles section with alias", () => {
    expect(normalizeWikilink("[[Note#Section|Display]]")).toBe("Note#Section");
  });

  it("handles empty string", () => {
    expect(normalizeWikilink("")).toBe("");
  });

  it("handles whitespace-only string", () => {
    expect(normalizeWikilink("   ")).toBe("");
  });

  it("handles brackets only", () => {
    expect(normalizeWikilink("[[]]")).toBe("");
  });
});

describe("classifyInput", () => {
  it("identifies mention prefix", () => {
    expect(classifyInput("@obs:note")).toBe("mention");
  });

  it("identifies skill prefix", () => {
    expect(classifyInput("/obs:skill")).toBe("skill");
  });

  it("classifies bare names as wikilink", () => {
    expect(classifyInput("Note")).toBe("wikilink");
  });

  it("classifies bracketed input as wikilink", () => {
    expect(classifyInput("[[Note]]")).toBe("wikilink");
  });

  it("classifies empty string as wikilink", () => {
    expect(classifyInput("")).toBe("wikilink");
  });
});

describe("resolveEmbeds", () => {
  it("resolves embed references with content", async () => {
    const resolver: EmbedResolver = vi
      .fn()
      .mockResolvedValue({ ok: true, value: "Embedded content" });
    const result = await resolveEmbeds("Before ![[Note]] after", resolver);
    expect(result).toEqual({ ok: true, value: "Before Embedded content after" });
    expect(resolver).toHaveBeenCalledWith("Note", undefined);
  });

  it("resolves embed with section", async () => {
    const resolver: EmbedResolver = vi
      .fn()
      .mockResolvedValue({ ok: true, value: "Section content" });
    const result = await resolveEmbeds("![[Note#Heading]]", resolver);
    expect(result).toEqual({ ok: true, value: "Section content" });
    expect(resolver).toHaveBeenCalledWith("Note", "Heading");
  });

  it("skips failed resolutions", async () => {
    const resolver: EmbedResolver = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: "FILE_NOT_FOUND", message: "nope" } });
    const result = await resolveEmbeds("Keep ![[Missing]] here", resolver);
    expect(result).toEqual({ ok: true, value: "Keep ![[Missing]] here" });
  });

  it("returns unchanged text when no embeds", async () => {
    const resolver: EmbedResolver = vi.fn();
    const result = await resolveEmbeds("No embeds [[wikilink]]", resolver);
    expect(result).toEqual({ ok: true, value: "No embeds [[wikilink]]" });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("resolves multiple embeds", async () => {
    const resolver: EmbedResolver = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: "First" })
      .mockResolvedValueOnce({ ok: true, value: "Second" });
    const result = await resolveEmbeds("![[A]] and ![[B]]", resolver);
    expect(result).toEqual({ ok: true, value: "First and Second" });
  });

  it("handles mixed success and failure", async () => {
    const resolver: EmbedResolver = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: "OK" })
      .mockResolvedValueOnce({ ok: false, error: { code: "FILE_NOT_FOUND", message: "nope" } })
      .mockResolvedValueOnce({ ok: true, value: "OK2" });
    const result = await resolveEmbeds("![[A]] and ![[B]] and ![[C]]", resolver);
    expect(result).toEqual({ ok: true, value: "OK and ![[B]] and OK2" });
  });

  it("preserves offset when replacement changes length", async () => {
    const resolver: EmbedResolver = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: "Short" })
      .mockResolvedValueOnce({ ok: true, value: "Very long content here" });
    const result = await resolveEmbeds("![[First]] and ![[Second]]", resolver);
    expect(result).toEqual({ ok: true, value: "Short and Very long content here" });
  });

  it("handles empty result from resolver", async () => {
    const resolver: EmbedResolver = vi.fn().mockResolvedValue({ ok: true, value: "" });
    const result = await resolveEmbeds("Text ![[Empty]] text", resolver);
    expect(result).toEqual({ ok: true, value: "Text  text" });
  });

  it("handles consecutive embeds with varying lengths", async () => {
    const resolver: EmbedResolver = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: "A" })
      .mockResolvedValueOnce({ ok: true, value: "BBBBB" });
    const result = await resolveEmbeds("![[X]]![[Y]]", resolver);
    expect(result).toEqual({ ok: true, value: "ABBBBB" });
  });
});
