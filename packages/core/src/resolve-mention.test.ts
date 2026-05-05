import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalIndexTracker } from "./local-index-tracker.js";
import {
  normalizeMention,
  parseSection,
  resolveMention,
  resolveSkillMention,
} from "./resolve-mention.js";
import { mockCLI, mockFsFunction } from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  realpath: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
}));

const { readFile, realpath, access, readdir } = await import("node:fs/promises");
const readFileMock = mockFsFunction(readFile);
const realpathMock = mockFsFunction(realpath);
const accessMock = mockFsFunction(access);
const readdirMock = mockFsFunction(readdir);

async function createTracker(
  configOverrides: Record<string, unknown> = {},
  cliOverrides: Parameters<typeof mockCLI>[0] = {},
): Promise<LocalIndexTracker> {
  const config = {
    agentsDirs: [],
    skillsDirs: [],
    allowedFolders: [],
    ...configOverrides,
  };

  readFileMock.mockImplementation((...args: unknown[]) => {
    if (args[1] === "utf-8") {
      return Promise.resolve(JSON.stringify(config));
    }
    return Promise.resolve(Buffer.from("file content"));
  });

  const result = await LocalIndexTracker.create(mockCLI(cliOverrides));
  if (!result.ok) throw new Error("Failed to create tracker: " + result.error.message);
  return result.value;
}

describe("resolveMention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realpathMock.mockImplementation((...args: unknown[]) => Promise.resolve(args[0]));
    readdirMock.mockResolvedValue([]);
  });

  it("returns INVALID_URI on missing prefix", async () => {
    const tracker = await createTracker();
    const result = await resolveMention("obs:something", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("returns INVALID_URI on empty reference", async () => {
    const tracker = await createTracker();
    const result = await resolveMention("@obs:", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("resolves agent mention", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const tracker = await createTracker({ agentsDirs: ["agents"] });

    readFileMock.mockResolvedValueOnce(Buffer.from("agent content"));

    const result = await resolveMention("@obs:architect", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("agent");
      expect(result.value.resolvedPath).toBe("agents/architect.md");
    }
  });

  it("resolves file path mention with slash", async () => {
    const tracker = await createTracker();

    readFileMock.mockResolvedValueOnce(Buffer.from("note content"));

    const result = await resolveMention("@obs:notes/plan.md", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("file");
      expect(result.value.resolvedPath).toBe("notes/plan.md");
    }
  });

  it("resolves wikilink mention", async () => {
    const tracker = await createTracker(
      {},
      {
        search: vi.fn().mockResolvedValue({ ok: true, value: ["notes/Project Plan.md"] }),
      },
    );

    readFileMock.mockResolvedValueOnce(Buffer.from("plan content"));

    const result = await resolveMention("@obs:Project Plan", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("file");
      expect(result.value.resolvedPath).toBe("notes/Project Plan.md");
    }
  });

  it("extracts section from mention", async () => {
    const tracker = await createTracker();

    readFileMock.mockResolvedValueOnce(
      Buffer.from("# Top\nIntro\n## Design\nDesign content\n## Other"),
    );

    const result = await resolveMention("@obs:notes/plan.md#Design", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.section).toBe("Design");
      expect(result.value.content).toContain("Design content");
      expect(result.value.content).not.toContain("Intro");
    }
  });

  it("treats empty section as undefined", async () => {
    const tracker = await createTracker();

    readFileMock.mockResolvedValueOnce(Buffer.from("content"));

    const result = await resolveMention("@obs:notes/plan.md#", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.section).toBeUndefined();
    }
  });

  it("scrubs wikilinks in output content", async () => {
    const tracker = await createTracker();

    readFileMock.mockResolvedValueOnce(Buffer.from("See [[Other Note]]"));

    const result = await resolveMention("@obs:notes/plan.md", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain("[Other Note]");
      expect(result.value.content).toContain("obs://");
      expect(result.value.content).not.toContain("[[");
    }
  });

  it("propagates readFile error", async () => {
    const tracker = await createTracker();

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    readFileMock.mockRejectedValueOnce(enoent);

    const result = await resolveMention("@obs:notes/missing.md", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("propagates section-not-found error", async () => {
    const tracker = await createTracker();

    readFileMock.mockResolvedValueOnce(Buffer.from("## Other\nContent"));

    const result = await resolveMention("@obs:notes/plan.md#Missing", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
      expect(result.error.message).toContain("Section not found");
    }
  });

  it("includes vaultName in result", async () => {
    const tracker = await createTracker();
    readFileMock.mockResolvedValueOnce(Buffer.from("content"));
    const result = await resolveMention("@obs:notes/plan.md", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.vaultName).toBe("TestVault");
  });

  it("resolves skill mention", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const tracker = await createTracker({ skillsDirs: ["skills"] });

    readFileMock.mockResolvedValueOnce(Buffer.from("skill content"));

    const result = await resolveMention("@obs:my-skill", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("skill");
      expect(result.value.resolvedPath).toBe("skills/my-skill/SKILL.md");
    }
  });

  it("returns INVALID_URI for @obs:#section (empty path)", async () => {
    const tracker = await createTracker();
    const result = await resolveMention("@obs:#Heading", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("resolves .md suffix mention as file path", async () => {
    const tracker = await createTracker();
    readFileMock.mockResolvedValueOnce(Buffer.from("content"));
    const result = await resolveMention("@obs:myfile.md", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("file");
      expect(result.value.resolvedPath).toBe("myfile.md");
    }
  });

  it("falls back to wikilink when direct slash-path does not exist", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    accessMock.mockRejectedValueOnce(enoent);

    const tracker = await createTracker(
      {},
      { search: vi.fn().mockResolvedValue({ ok: true, value: ["other/missing.md"] }) },
    );

    readFileMock.mockResolvedValueOnce(Buffer.from("found via wikilink"));

    const result = await resolveMention("@obs:notes/missing.md", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("file");
      expect(result.value.resolvedPath).toBe("other/missing.md");
    }
  });

  it("falls back to wikilink when .md suffix path does not exist", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    accessMock.mockRejectedValueOnce(enoent);

    const tracker = await createTracker(
      {},
      { search: vi.fn().mockResolvedValue({ ok: true, value: ["docs/myfile.md"] }) },
    );

    readFileMock.mockResolvedValueOnce(Buffer.from("found via wikilink"));

    const result = await resolveMention("@obs:myfile.md", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("file");
      expect(result.value.resolvedPath).toBe("docs/myfile.md");
    }
  });

  it("returns direct path when both access and wikilink fail", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    accessMock.mockRejectedValueOnce(enoent);

    const tracker = await createTracker();

    readFileMock.mockRejectedValueOnce(enoent);

    const result = await resolveMention("@obs:notes/gone.md", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });
});

describe("parseSection", () => {
  it("returns full string as namePart when no hash", () => {
    expect(parseSection("obsidian")).toEqual({ namePart: "obsidian", section: undefined });
  });

  it("splits on first hash", () => {
    expect(parseSection("obsidian#Usage")).toEqual({ namePart: "obsidian", section: "Usage" });
  });

  it("treats empty section as undefined", () => {
    expect(parseSection("obsidian#")).toEqual({ namePart: "obsidian", section: undefined });
  });

  it("handles path with hash", () => {
    expect(parseSection("notes/plan.md#Design")).toEqual({
      namePart: "notes/plan.md",
      section: "Design",
    });
  });
});

describe("resolveSkillMention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realpathMock.mockImplementation((...args: unknown[]) => Promise.resolve(args[0]));
    readdirMock.mockResolvedValue([]);
  });

  it("returns INVALID_URI on missing /obs: prefix", async () => {
    const tracker = await createTracker({ skillsDirs: ["skills"] });
    const result = await resolveSkillMention("@obs:obsidian", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("returns INVALID_URI on empty reference", async () => {
    const tracker = await createTracker({ skillsDirs: ["skills"] });
    const result = await resolveSkillMention("/obs:", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("resolves /obs:obsidian as skill", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const tracker = await createTracker({ skillsDirs: ["skills"] });

    readFileMock.mockResolvedValueOnce(Buffer.from("skill content"));

    const result = await resolveSkillMention("/obs:obsidian", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("skill");
      expect(result.value.resolvedPath).toBe("skills/obsidian/SKILL.md");
      expect(result.value.content).toContain("skill content");
    }
  });

  it("extracts section from /obs: mention", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const tracker = await createTracker({ skillsDirs: ["skills"] });

    readFileMock.mockResolvedValueOnce(
      Buffer.from("# Overview\nIntro\n## Usage\nHow to use\n## Other"),
    );

    const result = await resolveSkillMention("/obs:obsidian#Usage", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.section).toBe("Usage");
      expect(result.value.content).toContain("How to use");
      expect(result.value.content).not.toContain("Intro");
    }
  });

  it("returns error when skill not found (no wikilink fallback)", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    accessMock.mockRejectedValueOnce(enoent);

    const tracker = await createTracker({ skillsDirs: ["skills"] });

    const result = await resolveSkillMention("/obs:missing", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
    }
  });

  it("returns INVALID_URI for /obs:#section (empty path)", async () => {
    const tracker = await createTracker({ skillsDirs: ["skills"] });
    const result = await resolveSkillMention("/obs:#Heading", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });
});

describe("normalizeMention", () => {
  it("adds @obs: prefix to bare reference", () => {
    expect(normalizeMention("notes/plan.md")).toBe("@obs:notes/plan.md");
  });

  it("preserves existing @obs: prefix", () => {
    expect(normalizeMention("@obs:notes/plan.md")).toBe("@obs:notes/plan.md");
  });

  it("preserves existing /obs: prefix", () => {
    expect(normalizeMention("/obs:my-skill")).toBe("/obs:my-skill");
  });

  it("handles empty string", () => {
    expect(normalizeMention("")).toBe("@obs:");
  });
});
