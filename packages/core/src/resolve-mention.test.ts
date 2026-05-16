import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalIndexTracker } from "./local-index-tracker.js";
import { isAllowedPath } from "./path-security.js";
import {
  normalizeMention,
  parseSection,
  resolveMention,
  resolveSkillMention,
} from "./resolve-mention.js";
import { mockCLI } from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  realpath: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
}));

const { readFile, realpath, access, readdir } = await import("node:fs/promises");
const readFileMock = vi.mocked(readFile as (...args: unknown[]) => Promise<unknown>);
const realpathMock = vi.mocked(realpath as unknown as (...args: unknown[]) => Promise<unknown>);
const accessMock = vi.mocked(access as unknown as (...args: unknown[]) => Promise<unknown>);
const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);

interface TrackerStubOptions {
  agents?: string[];
  skills?: string[];
  allowed?: readonly string[];
  blocked?: readonly string[];
  cliOverrides?: Parameters<typeof mockCLI>[0];
}

function stubTracker(opts: TrackerStubOptions = {}): LocalIndexTracker {
  const { agents = [], skills = [], allowed = [], blocked = [], cliOverrides = {} } = opts;
  const cli = mockCLI(cliOverrides);
  return {
    context: {
      physicalPath: "/vault",
      name: "TestVault",
      vfsConfig: { agents, skills, allowed, blocked },
      mode: "full" as const,
    },
    cli,
    cache: { get: () => undefined, set: vi.fn(), delete: vi.fn() },
    readFile: vi.fn(async (p: string) => {
      const secOpts = { vaultRoot: "/vault", allowed, blocked };
      if (!isAllowedPath(p, secOpts)) {
        return { ok: false, error: { code: "PERMISSION_DENIED", message: "Not allowed" } };
      }
      const abs = p.startsWith("/") ? p : `/vault/${p}`;
      try {
        const buf = await readFileMock(abs);
        return { ok: true as const, value: new TextDecoder().decode(buf as BufferSource) };
      } catch (err) {
        const errno = (err as NodeJS.ErrnoException).code;
        if (errno === "ENOENT") {
          return { ok: false, error: { code: "FILE_NOT_FOUND", message: (err as Error).message } };
        }
        return { ok: false, error: { code: "IO_ERROR", message: (err as Error).message } };
      }
    }),
    resolveSkill: vi.fn(async (name: string) => {
      if (skills.length === 0) {
        return { ok: false, error: { code: "FILE_NOT_FOUND", message: "No skills dirs" } };
      }
      const skillPath = `${skills[0]}/${name}/SKILL.md`;
      const abs = `/vault/${skillPath}`;
      try {
        await accessMock(abs);
        return { ok: true as const, value: skillPath };
      } catch {
        return {
          ok: false,
          error: { code: "FILE_NOT_FOUND", message: `Skill not found: ${name}` },
        };
      }
    }),
  } as unknown as LocalIndexTracker;
}

describe("resolveMention", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    realpathMock.mockImplementation((...args: unknown[]) => Promise.resolve(args[0]));
    readdirMock.mockResolvedValue([]);
  });

  it("returns INVALID_URI on missing prefix", async () => {
    const result = await resolveMention("obs:something", stubTracker());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("returns INVALID_URI on empty reference", async () => {
    const result = await resolveMention("@obs:", stubTracker());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("resolves agent mention", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const tracker = stubTracker({ agents: ["agents"] });

    readFileMock.mockResolvedValueOnce(Buffer.from("agent content"));

    const result = await resolveMention("@obs:architect", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("agent");
      expect(result.value.resolvedPath).toBe("agents/architect.md");
    }
  });

  it("resolves file path mention with slash", async () => {
    const tracker = stubTracker();

    readFileMock.mockResolvedValueOnce(Buffer.from("note content"));

    const result = await resolveMention("@obs:notes/plan.md", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("file");
      expect(result.value.resolvedPath).toBe("notes/plan.md");
    }
  });

  it("resolves wikilink mention", async () => {
    const tracker = stubTracker({
      cliOverrides: {
        search: vi.fn().mockResolvedValue({ ok: true, value: ["notes/Project Plan.md"] }),
      },
    });

    readFileMock.mockResolvedValueOnce(Buffer.from("plan content"));

    const result = await resolveMention("@obs:Project Plan", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("file");
      expect(result.value.resolvedPath).toBe("notes/Project Plan.md");
    }
  });

  it("extracts section from mention", async () => {
    const tracker = stubTracker();

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
    const tracker = stubTracker();

    readFileMock.mockResolvedValueOnce(Buffer.from("content"));

    const result = await resolveMention("@obs:notes/plan.md#", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.section).toBeUndefined();
    }
  });

  it("scrubs wikilinks in output content", async () => {
    const tracker = stubTracker();

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
    const tracker = stubTracker();

    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    readFileMock.mockRejectedValueOnce(enoent);

    const result = await resolveMention("@obs:notes/missing.md", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("propagates section-not-found error", async () => {
    const tracker = stubTracker();

    readFileMock.mockResolvedValueOnce(Buffer.from("## Other\nContent"));

    const result = await resolveMention("@obs:notes/plan.md#Missing", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
      expect(result.error.message).toContain("Section not found");
    }
  });

  it("includes vaultName in result", async () => {
    const tracker = stubTracker();
    readFileMock.mockResolvedValueOnce(Buffer.from("content"));
    const result = await resolveMention("@obs:notes/plan.md", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.vaultName).toBe("TestVault");
  });

  it("resolves skill mention", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const tracker = stubTracker({ skills: ["skills"] });

    readFileMock.mockResolvedValueOnce(Buffer.from("skill content"));

    const result = await resolveMention("@obs:my-skill", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("skill");
      expect(result.value.resolvedPath).toBe("skills/my-skill/SKILL.md");
    }
  });

  it("returns INVALID_URI for @obs:#section (empty path)", async () => {
    const result = await resolveMention("@obs:#Heading", stubTracker());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("resolves .md suffix mention as file path", async () => {
    const tracker = stubTracker();
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

    const tracker = stubTracker({
      cliOverrides: {
        search: vi.fn().mockResolvedValue({ ok: true, value: ["other/missing.md"] }),
      },
    });

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

    const tracker = stubTracker({
      cliOverrides: {
        search: vi.fn().mockResolvedValue({ ok: true, value: ["docs/myfile.md"] }),
      },
    });

    readFileMock.mockResolvedValueOnce(Buffer.from("found via wikilink"));

    const result = await resolveMention("@obs:myfile.md", tracker);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetType).toBe("file");
      expect(result.value.resolvedPath).toBe("docs/myfile.md");
    }
  });

  it("returns error when both access and wikilink fail", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    accessMock.mockRejectedValueOnce(enoent);

    const tracker = stubTracker();

    readFileMock.mockRejectedValueOnce(enoent);

    const result = await resolveMention("@obs:notes/gone.md", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_NOT_FOUND");
  });

  it("rejects path outside allowed folders", async () => {
    const tracker = stubTracker({ allowed: ["notes"] });

    const result = await resolveMention("@obs:private/secret.md", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects path inside blocked folders", async () => {
    const tracker = stubTracker({ blocked: ["notes/draft"] });

    const result = await resolveMention("@obs:notes/draft/wip.md", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects skill mention when skill folder is outside allowed", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const tracker = stubTracker({
      skills: ["skills"],
      allowed: ["notes"],
    });

    const result = await resolveMention("@obs:my-skill", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PERMISSION_DENIED");
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
    const result = await resolveSkillMention("@obs:obsidian", stubTracker({ skills: ["skills"] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("returns INVALID_URI on empty reference", async () => {
    const result = await resolveSkillMention("/obs:", stubTracker({ skills: ["skills"] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URI");
  });

  it("resolves /obs:obsidian as skill", async () => {
    accessMock.mockResolvedValueOnce(undefined);
    const tracker = stubTracker({ skills: ["skills"] });

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
    const tracker = stubTracker({ skills: ["skills"] });

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

    const tracker = stubTracker({ skills: ["skills"] });

    const result = await resolveSkillMention("/obs:missing", tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
    }
  });

  it("returns INVALID_URI for /obs:#section (empty path)", async () => {
    const result = await resolveSkillMention("/obs:#Heading", stubTracker({ skills: ["skills"] }));
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
