import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalIndexTracker } from "./local-index-tracker.js";
import { resolveMention } from "./resolve-mention.js";
import { mockCLI } from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  realpath: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
}));

const { readFile, realpath, access } = await import("node:fs/promises");
const readFileMock = vi.mocked(readFile as unknown as (...args: unknown[]) => Promise<unknown>);
const realpathMock = vi.mocked(realpath as unknown as (...args: unknown[]) => Promise<unknown>);
const accessMock = vi.mocked(access as unknown as (...args: unknown[]) => Promise<unknown>);

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
      expect(result.value.resolvedPath).toBe("skills/my-skill.md");
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
});
