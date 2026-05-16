import { describe, expect, it, vi } from "vitest";

import { createVscodeMock, mockLocalIndexTracker } from "./test-helpers.js";

vi.mock("vscode", () => createVscodeMock({ uri: true, documentLink: true, range: true }));

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, parseMarkdownLinks: vi.fn() };
});

import type { ParsedLink } from "@obsidian-vfs/core";
import { parseMarkdownLinks } from "@obsidian-vfs/core";
import type * as vscode from "vscode";

import { WikilinkDocumentLinkProvider } from "./wikilink-provider.js";

const mockParseMarkdownLinks = vi.mocked(parseMarkdownLinks);

function fakeDocument(text: string): vscode.TextDocument {
  return {
    getText: () => text,
    positionAt: (offset: number) => {
      let line = 0;
      let remaining = offset;
      for (const l of text.split("\n")) {
        if (remaining <= l.length) return { line, character: remaining };
        remaining -= l.length + 1;
        line++;
      }
      return { line, character: remaining };
    },
  } as unknown as vscode.TextDocument;
}

function makeParsedLink(overrides: Partial<ParsedLink> = {}): ParsedLink {
  return {
    kind: "wikilink",
    target: "Note",
    startIndex: 0,
    endIndex: 8,
    ...overrides,
  };
}

describe("WikilinkDocumentLinkProvider", () => {
  it("resolves wikilinks and returns DocumentLinks", async () => {
    const tracker = mockLocalIndexTracker({
      resolveWikilink: vi.fn().mockResolvedValue({
        ok: true,
        value: { resolvedPath: "folder/Note.md", candidates: [] },
      }),
    });

    mockParseMarkdownLinks.mockReturnValueOnce([
      makeParsedLink({ target: "Note", startIndex: 4, endIndex: 14 }),
    ]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const doc = fakeDocument("See [[Note]] here");
    const links = await provider.provideDocumentLinks(doc);

    expect(links).toHaveLength(1);
    expect(links[0].target).toMatchObject({ scheme: "file", fsPath: "/vault/folder/Note.md" });
  });

  it("skips failed wikilink resolutions", async () => {
    const tracker = mockLocalIndexTracker({
      resolveWikilink: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: "nope" },
      }),
    });

    mockParseMarkdownLinks.mockReturnValueOnce([makeParsedLink()]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const links = await provider.provideDocumentLinks(fakeDocument("[[Missing]]"));

    expect(links).toHaveLength(0);
  });

  it("returns empty array for documents with no wikilinks", async () => {
    const tracker = mockLocalIndexTracker();
    mockParseMarkdownLinks.mockReturnValueOnce([]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const links = await provider.provideDocumentLinks(fakeDocument("No links"));

    expect(links).toHaveLength(0);
  });

  it("excludes embed entries", async () => {
    const tracker = mockLocalIndexTracker({
      resolveWikilink: vi.fn().mockResolvedValue({
        ok: true,
        value: { resolvedPath: "Note.md", candidates: [] },
      }),
    });

    mockParseMarkdownLinks.mockReturnValueOnce([
      makeParsedLink({ kind: "embed", target: "Embedded" }),
      makeParsedLink({ kind: "wikilink", target: "Note", startIndex: 20, endIndex: 28 }),
    ]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const links = await provider.provideDocumentLinks(fakeDocument("![[Embedded]] and [[Note]]"));

    expect(links).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tracker.resolveWikilink).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tracker.resolveWikilink).toHaveBeenCalledWith("Note");
  });

  it("handles multiple wikilinks in same document", async () => {
    const tracker = mockLocalIndexTracker({
      resolveWikilink: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: { resolvedPath: "A.md", candidates: [] } })
        .mockResolvedValueOnce({ ok: true, value: { resolvedPath: "B.md", candidates: [] } }),
    });

    mockParseMarkdownLinks.mockReturnValueOnce([
      makeParsedLink({ target: "A", startIndex: 0, endIndex: 5 }),
      makeParsedLink({ target: "B", startIndex: 10, endIndex: 15 }),
    ]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const links = await provider.provideDocumentLinks(fakeDocument("[[A]] and [[B]]"));

    expect(links).toHaveLength(2);
  });

  it("handles wikilinks with sections (section is part of target)", async () => {
    const tracker = mockLocalIndexTracker({
      resolveWikilink: vi.fn().mockResolvedValue({
        ok: true,
        value: { resolvedPath: "Note.md", candidates: [] },
      }),
    });

    mockParseMarkdownLinks.mockReturnValueOnce([
      makeParsedLink({ target: "Note", section: "Heading", startIndex: 0, endIndex: 18 }),
    ]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const links = await provider.provideDocumentLinks(fakeDocument("[[Note#Heading]]"));

    expect(links).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tracker.resolveWikilink).toHaveBeenCalledWith("Note");
  });

  it("handles empty document", async () => {
    const tracker = mockLocalIndexTracker();
    mockParseMarkdownLinks.mockReturnValueOnce([]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const links = await provider.provideDocumentLinks(fakeDocument(""));

    expect(links).toHaveLength(0);
  });

  it("handles document with only embeds (no wikilinks)", async () => {
    const resolveWikilink = vi.fn();
    const tracker = mockLocalIndexTracker({ resolveWikilink });

    mockParseMarkdownLinks.mockReturnValueOnce([
      makeParsedLink({ kind: "embed", target: "A" }),
      makeParsedLink({ kind: "embed", target: "B" }),
    ]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const links = await provider.provideDocumentLinks(fakeDocument("![[A]] ![[B]]"));

    expect(links).toHaveLength(0);
    expect(resolveWikilink).not.toHaveBeenCalled();
  });

  it("handles mixed successful and failed resolutions", async () => {
    const tracker = mockLocalIndexTracker({
      resolveWikilink: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: { resolvedPath: "A.md", candidates: [] } })
        .mockResolvedValueOnce({ ok: false, error: { code: "FILE_NOT_FOUND", message: "nope" } })
        .mockResolvedValueOnce({ ok: true, value: { resolvedPath: "C.md", candidates: [] } }),
    });

    mockParseMarkdownLinks.mockReturnValueOnce([
      makeParsedLink({ target: "A", startIndex: 0, endIndex: 5 }),
      makeParsedLink({ target: "B", startIndex: 6, endIndex: 11 }),
      makeParsedLink({ target: "C", startIndex: 12, endIndex: 17 }),
    ]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const links = await provider.provideDocumentLinks(fakeDocument("[[A]][[B]][[C]]"));

    expect(links).toHaveLength(2);
    expect(links[0].target).toMatchObject({ scheme: "file", fsPath: "/vault/A.md" });
    expect(links[1].target).toMatchObject({ scheme: "file", fsPath: "/vault/C.md" });
  });

  it("correctly maps character positions to VSCode ranges", async () => {
    const tracker = mockLocalIndexTracker({
      resolveWikilink: vi.fn().mockResolvedValue({
        ok: true,
        value: { resolvedPath: "Note.md", candidates: [] },
      }),
    });

    mockParseMarkdownLinks.mockReturnValueOnce([
      makeParsedLink({ target: "Note", startIndex: 7, endIndex: 15 }),
    ]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const doc = fakeDocument("Before [[Note]] after");
    const links = await provider.provideDocumentLinks(doc);

    expect(links).toHaveLength(1);
    expect(links[0].range.start).toMatchObject({ line: 0, character: 7 });
    expect(links[0].range.end).toMatchObject({ line: 0, character: 15 });
  });

  it("handles multiline documents correctly", async () => {
    const tracker = mockLocalIndexTracker({
      resolveWikilink: vi.fn().mockResolvedValue({
        ok: true,
        value: { resolvedPath: "Note.md", candidates: [] },
      }),
    });

    const text = "Line 1\nLine 2 [[Note]]\nLine 3";
    const noteStartIndex = text.indexOf("[[Note]]");

    mockParseMarkdownLinks.mockReturnValueOnce([
      makeParsedLink({ target: "Note", startIndex: noteStartIndex, endIndex: noteStartIndex + 8 }),
    ]);

    const provider = new WikilinkDocumentLinkProvider(tracker);
    const links = await provider.provideDocumentLinks(fakeDocument(text));

    expect(links).toHaveLength(1);
    expect(links[0].range.start).toMatchObject({ line: 1, character: 7 });
    expect(links[0].range.end).toMatchObject({ line: 1, character: 15 });
  });
});
