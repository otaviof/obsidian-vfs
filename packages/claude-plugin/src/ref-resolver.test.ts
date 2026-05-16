import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obsidian-vfs/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    resolveMention: vi.fn(),
  };
});

import { resolveMention } from "@obsidian-vfs/core";
import type { VFSResult, MentionResult } from "@obsidian-vfs/core";

import { resolveObsUriReferences } from "./ref-resolver.js";
import { fakeLocalIndexTracker } from "./test-helpers.js";

const mockResolveMention = vi.mocked(resolveMention);

describe("resolveObsUriReferences", () => {
  const fakeTracker = fakeLocalIndexTracker();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no obs:// URIs in content", async () => {
    const result = await resolveObsUriReferences("No URIs here", fakeTracker);
    expect(result).toHaveLength(0);
    expect(mockResolveMention).not.toHaveBeenCalled();
  });

  it("resolves content with one obs:// URI reference", async () => {
    const mentionResult: VFSResult<MentionResult> = {
      ok: true,
      value: {
        targetType: "file",
        resolvedPath: "my-note.md",
        vaultName: "drafts",
        content: "Note content here",
        section: undefined,
      },
    };
    mockResolveMention.mockResolvedValueOnce(mentionResult);

    const result = await resolveObsUriReferences(
      "See [note](obs://drafts/my-note) for details",
      fakeTracker,
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("resolved");
    if (result[0].status === "resolved") {
      expect(result[0].content).toBe("Note content here");
      expect(result[0].targetType).toBe("file");
    }
    expect(mockResolveMention).toHaveBeenCalledWith("@obs:my-note", fakeTracker);
  });

  it("resolves content with multiple references", async () => {
    mockResolveMention
      .mockResolvedValueOnce({
        ok: true,
        value: {
          targetType: "file" as const,
          resolvedPath: "a.md",
          vaultName: "drafts",
          content: "Content A",
          section: undefined,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          targetType: "file" as const,
          resolvedPath: "b.md",
          vaultName: "drafts",
          content: "Content B",
          section: "Heading",
        },
      });

    const result = await resolveObsUriReferences(
      "[A](obs://drafts/a) and [B](obs://drafts/b#Heading)",
      fakeTracker,
    );

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe("resolved");
    expect(result[1].status).toBe("resolved");
  });

  it("handles individual resolution failure gracefully", async () => {
    mockResolveMention.mockResolvedValueOnce({
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "File not found: missing" },
    });

    const result = await resolveObsUriReferences("See [note](obs://drafts/missing)", fakeTracker);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("error");
    if (result[0].status === "error") {
      expect(result[0].errorMessage).toBe("File not found: missing");
    }
  });

  it("deduplicates references to the same target", async () => {
    mockResolveMention.mockResolvedValueOnce({
      ok: true,
      value: {
        targetType: "file" as const,
        resolvedPath: "note.md",
        vaultName: "drafts",
        content: "Content",
        section: undefined,
      },
    });

    const result = await resolveObsUriReferences(
      "obs://drafts/note and obs://drafts/note again",
      fakeTracker,
    );

    expect(result).toHaveLength(1);
    expect(mockResolveMention).toHaveBeenCalledTimes(1);
  });

  it("passes section to resolveMention", async () => {
    mockResolveMention.mockResolvedValueOnce({
      ok: true,
      value: {
        targetType: "file" as const,
        resolvedPath: "note.md",
        vaultName: "drafts",
        content: "Section content",
        section: "Heading",
      },
    });

    await resolveObsUriReferences("obs://drafts/note#Heading", fakeTracker);

    expect(mockResolveMention).toHaveBeenCalledWith("@obs:note#Heading", fakeTracker);
  });
});
