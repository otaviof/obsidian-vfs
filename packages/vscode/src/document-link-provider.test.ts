import { describe, expect, it, vi } from "vitest";

import { createVscodeMock, mockLocalIndexTracker } from "./test-helpers.js";

vi.mock("vscode", () => createVscodeMock({ uri: true, documentLink: true, range: true }));

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, parseMarkdownLinks: vi.fn(), parseObsLinks: vi.fn(), parseObsUri: vi.fn() };
});

import type { ParsedLink, ParsedObsLink } from "@obsidian-vfs/core";
import { parseMarkdownLinks, parseObsLinks, parseObsUri } from "@obsidian-vfs/core";
import type * as vscode from "vscode";

import { ObsidianDocumentLinkProvider } from "./document-link-provider.js";

const mockParseMarkdownLinks = vi.mocked(parseMarkdownLinks);
const mockParseObsLinks = vi.mocked(parseObsLinks);
const mockParseObsUri = vi.mocked(parseObsUri);

function fakeTextDocument(text: string): vscode.TextDocument {
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

function makeParsedObsLink(overrides: Partial<ParsedObsLink> = {}): ParsedObsLink {
  return {
    displayText: "note",
    rawUri: "obs://TestVault/note",
    startIndex: 0,
    endIndex: 26,
    ...overrides,
  };
}

describe("ObsidianDocumentLinkProvider", () => {
  describe("wikilink support (migrated tests)", () => {
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
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const doc = fakeTextDocument("See [[Note]] here");
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
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(fakeTextDocument("[[Missing]]"));

      expect(links).toHaveLength(0);
    });

    it("returns empty array for documents with no wikilinks", async () => {
      const tracker = mockLocalIndexTracker();
      mockParseMarkdownLinks.mockReturnValueOnce([]);
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(fakeTextDocument("No links"));

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
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(
        fakeTextDocument("![[Embedded]] and [[Note]]"),
      );

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
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(fakeTextDocument("[[A]] and [[B]]"));

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
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(fakeTextDocument("[[Note#Heading]]"));

      expect(links).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tracker.resolveWikilink).toHaveBeenCalledWith("Note");
    });

    it("handles empty document", async () => {
      const tracker = mockLocalIndexTracker();
      mockParseMarkdownLinks.mockReturnValueOnce([]);
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(fakeTextDocument(""));

      expect(links).toHaveLength(0);
    });

    it("handles document with only embeds (no wikilinks)", async () => {
      const resolveWikilink = vi.fn();
      const tracker = mockLocalIndexTracker({ resolveWikilink });

      mockParseMarkdownLinks.mockReturnValueOnce([
        makeParsedLink({ kind: "embed", target: "A" }),
        makeParsedLink({ kind: "embed", target: "B" }),
      ]);
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(fakeTextDocument("![[A]] ![[B]]"));

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
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(fakeTextDocument("[[A]][[B]][[C]]"));

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
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const doc = fakeTextDocument("Before [[Note]] after");
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
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(fakeTextDocument(text));

      expect(links).toHaveLength(1);
      expect(links[0].range.start).toMatchObject({ line: 1, character: 7 });
      expect(links[0].range.end).toMatchObject({ line: 1, character: 15 });
    });
  });

  describe("obs:// link support (new tests)", () => {
    it("resolves obs:// link to file:// URI", async () => {
      const tracker = mockLocalIndexTracker();
      mockParseMarkdownLinks.mockReturnValueOnce([]);
      mockParseObsLinks.mockReturnValueOnce([
        makeParsedObsLink({
          displayText: "note",
          rawUri: "obs://TestVault/folder/Note.md",
          startIndex: 0,
          endIndex: 40,
        }),
      ]);
      mockParseObsUri.mockReturnValueOnce({
        ok: true,
        value: { vaultName: "TestVault", path: "folder/Note.md", section: undefined, scheme: "obs" },
      });

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(
        fakeTextDocument("[note](obs://TestVault/folder/Note.md)"),
      );

      expect(links).toHaveLength(1);
      expect(links[0].target).toMatchObject({ scheme: "file", fsPath: "/vault/folder/Note.md" });
    });

    it("strips fragment from file:// URI", async () => {
      const tracker = mockLocalIndexTracker();
      mockParseMarkdownLinks.mockReturnValueOnce([]);
      mockParseObsLinks.mockReturnValueOnce([
        makeParsedObsLink({
          rawUri: "obs://TestVault/note.md#section",
          startIndex: 0,
          endIndex: 40,
        }),
      ]);
      mockParseObsUri.mockReturnValueOnce({
        ok: true,
        value: { vaultName: "TestVault", path: "note.md", section: "section", scheme: "obs" },
      });

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(
        fakeTextDocument("[note](obs://TestVault/note.md#section)"),
      );

      expect(links).toHaveLength(1);
      expect(links[0].target).toMatchObject({ scheme: "file", fsPath: "/vault/note.md" });
    });

    it("skips obs:// link when vault name mismatches", async () => {
      const tracker = mockLocalIndexTracker();
      mockParseMarkdownLinks.mockReturnValueOnce([]);
      mockParseObsLinks.mockReturnValueOnce([
        makeParsedObsLink({ rawUri: "obs://OtherVault/note.md" }),
      ]);
      mockParseObsUri.mockReturnValueOnce({
        ok: true,
        value: { vaultName: "OtherVault", path: "note.md", section: undefined, scheme: "obs" },
      });

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(
        fakeTextDocument("[note](obs://OtherVault/note.md)"),
      );

      expect(links).toHaveLength(0);
    });

    it("does not create links for https:// URIs", async () => {
      const tracker = mockLocalIndexTracker();
      mockParseMarkdownLinks.mockReturnValueOnce([]);
      mockParseObsLinks.mockReturnValueOnce([]);

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(
        fakeTextDocument("[link](https://example.com)"),
      );

      expect(links).toHaveLength(0);
    });

    it("handles mixed wikilinks and obs:// links", async () => {
      const tracker = mockLocalIndexTracker({
        resolveWikilink: vi.fn().mockResolvedValue({
          ok: true,
          value: { resolvedPath: "Note.md", candidates: [] },
        }),
      });

      mockParseMarkdownLinks.mockReturnValueOnce([
        makeParsedLink({ target: "Note", startIndex: 0, endIndex: 8 }),
      ]);
      mockParseObsLinks.mockReturnValueOnce([
        makeParsedObsLink({
          rawUri: "obs://TestVault/other.md",
          startIndex: 13,
          endIndex: 47,
        }),
      ]);
      mockParseObsUri.mockReturnValueOnce({
        ok: true,
        value: { vaultName: "TestVault", path: "other.md", section: undefined, scheme: "obs" },
      });

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(
        fakeTextDocument("[[Note]] and [link](obs://TestVault/other.md)"),
      );

      expect(links).toHaveLength(2);
      expect(links[0].target).toMatchObject({ scheme: "file" });
      expect(links[1].target).toMatchObject({ scheme: "file" });
    });

    it("appends .md to extensionless path", async () => {
      const tracker = mockLocalIndexTracker();
      mockParseMarkdownLinks.mockReturnValueOnce([]);
      mockParseObsLinks.mockReturnValueOnce([makeParsedObsLink({ rawUri: "obs://TestVault/note" })]);
      mockParseObsUri.mockReturnValueOnce({
        ok: true,
        value: { vaultName: "TestVault", path: "note", section: undefined, scheme: "obs" },
      });

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(
        fakeTextDocument("[note](obs://TestVault/note)"),
      );

      expect(links).toHaveLength(1);
      expect(links[0].target).toMatchObject({ scheme: "file", fsPath: "/vault/note.md" });
    });

    it("skips obs:// link when parseObsUri fails", async () => {
      const tracker = mockLocalIndexTracker();
      mockParseMarkdownLinks.mockReturnValueOnce([]);
      mockParseObsLinks.mockReturnValueOnce([makeParsedObsLink({ rawUri: "obs://malformed" })]);
      mockParseObsUri.mockReturnValueOnce({
        ok: false,
        error: { code: "INVALID_URI", message: "missing path" },
      });

      const provider = new ObsidianDocumentLinkProvider(tracker);
      const links = await provider.provideDocumentLinks(fakeTextDocument("[bad](obs://malformed)"));

      expect(links).toHaveLength(0);
    });
  });
});
