import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalIndexTracker } from "./local-index-tracker.js";
import { mockCLI } from "./test-helpers.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  realpath: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

const { readFile, realpath } = await import("node:fs/promises");
const readFileMock = vi.mocked(readFile as unknown as (...args: unknown[]) => Promise<unknown>);
const realpathMock = vi.mocked(realpath as unknown as (...args: unknown[]) => Promise<unknown>);

describe("LocalIndexTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    readFileMock.mockRejectedValue(enoent);
    realpathMock.mockImplementation((...args: unknown[]) => Promise.resolve(args[0]));
  });

  describe("create", () => {
    it("succeeds with valid vault and missing config file", async () => {
      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.name).toBe("TestVault");
        expect(result.value.context.physicalPath).toBe("/vault");
        expect(result.value.context.vfsConfig).toEqual({
          agentsDirs: [],
          skillsDirs: [],
          allowedFolders: [],
        });
      }
    });

    it("succeeds with valid config file", async () => {
      readFileMock.mockImplementation((...args: unknown[]) => {
        if (args[1] === "utf-8") {
          return Promise.resolve(
            JSON.stringify({
              agentsDirs: ["agents"],
              skillsDirs: ["skills"],
              allowedFolders: ["notes"],
            }),
          );
        }
        return Promise.reject(new Error("unexpected"));
      });
      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.vfsConfig.agentsDirs).toEqual(["agents"]);
      }
    });

    it("fails when vaultPath fails", async () => {
      const cli = mockCLI({
        vaultPath: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "CLI_UNAVAILABLE", message: "No CLI" },
        }),
      });
      const result = await LocalIndexTracker.create(cli);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VAULT_NOT_FOUND");
      }
    });

    it("fails when vaultName fails", async () => {
      const cli = mockCLI({
        vaultName: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "CLI_ERROR", message: "Failed" },
        }),
      });
      const result = await LocalIndexTracker.create(cli);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VAULT_NOT_FOUND");
      }
    });

    it("fails on invalid JSON in config file", async () => {
      readFileMock.mockImplementation((...args: unknown[]) => {
        if (args[1] === "utf-8") return Promise.resolve("not json{");
        return Promise.reject(new Error("unexpected"));
      });
      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("fails on invalid config shape", async () => {
      readFileMock.mockImplementation((...args: unknown[]) => {
        if (args[1] === "utf-8") return Promise.resolve(JSON.stringify({ agentsDirs: 42 }));
        return Promise.reject(new Error("unexpected"));
      });
      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("sets mode to full when CLI is available", async () => {
      const result = await LocalIndexTracker.create(
        mockCLI({ isAvailable: vi.fn().mockResolvedValue(true) }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.context.mode).toBe("full");
    });

    it("sets mode to degraded when CLI is unavailable", async () => {
      const result = await LocalIndexTracker.create(
        mockCLI({ isAvailable: vi.fn().mockResolvedValue(false) }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.context.mode).toBe("degraded");
    });

    it("returns PARSE_ERROR on non-ENOENT config read error", async () => {
      const eacces = new Error("EACCES") as NodeJS.ErrnoException;
      eacces.code = "EACCES";
      readFileMock.mockRejectedValue(eacces);
      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
      }
    });

    it("deep-freezes vfsConfig arrays", async () => {
      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.isFrozen(result.value.context.vfsConfig)).toBe(true);
      expect(Object.isFrozen(result.value.context.vfsConfig.allowedFolders)).toBe(true);
      expect(Object.isFrozen(result.value.context.vfsConfig.agentsDirs)).toBe(true);
      expect(Object.isFrozen(result.value.context.vfsConfig.skillsDirs)).toBe(true);
    });

    it("freezes context", async () => {
      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(true);
      if (result.ok) expect(Object.isFrozen(result.value.context)).toBe(true);
    });
  });

  describe("readFile", () => {
    async function createTracker() {
      const result = await LocalIndexTracker.create(mockCLI());
      if (!result.ok) throw new Error("Failed to create tracker");
      return result.value;
    }

    it("returns file content on successful read", async () => {
      const tracker = await createTracker();
      readFileMock.mockResolvedValue(Buffer.from("hello world"));
      const result = await tracker.readFile("notes/foo.md");
      expect(result).toEqual({ ok: true, value: "hello world" });
    });

    it("returns cached content on second read", async () => {
      const tracker = await createTracker();
      readFileMock.mockResolvedValue(Buffer.from("content"));

      await tracker.readFile("notes/foo.md");
      readFileMock.mockClear();

      const result = await tracker.readFile("notes/foo.md");
      expect(result).toEqual({ ok: true, value: "content" });
      expect(readFileMock).not.toHaveBeenCalled();
    });

    it("shares cache for equivalent paths", async () => {
      const tracker = await createTracker();
      readFileMock.mockResolvedValue(Buffer.from("shared"));

      await tracker.readFile("notes/foo.md");
      readFileMock.mockClear();

      const result = await tracker.readFile("./notes/foo.md");
      expect(result).toEqual({ ok: true, value: "shared" });
      expect(readFileMock).not.toHaveBeenCalled();
    });

    it("does not cache errors", async () => {
      const tracker = await createTracker();
      const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
      enoent.code = "ENOENT";
      readFileMock.mockRejectedValueOnce(enoent);

      const first = await tracker.readFile("notes/missing.md");
      expect(first.ok).toBe(false);

      readFileMock.mockResolvedValueOnce(Buffer.from("now exists"));
      const second = await tracker.readFile("notes/missing.md");
      expect(second).toEqual({ ok: true, value: "now exists" });
    });

    it("validates path security", async () => {
      const tracker = await createTracker();
      const result = await tracker.readFile("../../etc/passwd");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PERMISSION_DENIED");
      }
    });

    it("respects allowedFolders", async () => {
      readFileMock.mockImplementation((...args: unknown[]) => {
        if (args[1] === "utf-8") {
          return Promise.resolve(JSON.stringify({ allowedFolders: ["notes"] }));
        }
        return Promise.reject(new Error("unexpected"));
      });
      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const readResult = await result.value.readFile("private/secret.md");
      expect(readResult.ok).toBe(false);
      if (!readResult.ok) {
        expect(readResult.error.code).toBe("PERMISSION_DENIED");
      }
    });

    it("invalidates entry on cache.delete", async () => {
      const tracker = await createTracker();
      readFileMock.mockResolvedValue(Buffer.from("old"));

      await tracker.readFile("notes/foo.md");
      tracker.cache.delete("/vault/notes/foo.md");

      readFileMock.mockResolvedValue(Buffer.from("new"));
      const result = await tracker.readFile("notes/foo.md");
      expect(result).toEqual({ ok: true, value: "new" });
    });

    it("respects custom cacheMaxSize", async () => {
      const result = await LocalIndexTracker.create(mockCLI(), { cacheMaxSize: 2 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const tracker = result.value;
      readFileMock.mockResolvedValue(Buffer.from("content"));

      await tracker.readFile("a.md");
      await tracker.readFile("b.md");
      await tracker.readFile("c.md");

      expect(tracker.cache.has("/vault/a.md")).toBe(false);
      expect(tracker.cache.has("/vault/b.md")).toBe(true);
      expect(tracker.cache.has("/vault/c.md")).toBe(true);
    });
  });

  describe("resolveWikilink", () => {
    it("delegates to resolveWikilink with correct options", async () => {
      const searchMock = vi.fn().mockResolvedValue({ ok: true, value: ["notes/Note.md"] });
      const cli = mockCLI({ search: searchMock });
      const result = await LocalIndexTracker.create(cli);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const resolved = await result.value.resolveWikilink("Note");
      expect(resolved).toEqual({
        ok: true,
        value: { resolvedPath: "notes/Note.md", candidates: ["notes/Note.md"] },
      });
      expect(searchMock).toHaveBeenCalledWith("file:Note");
    });
  });

  describe("resolveAgent", () => {
    it("delegates to resolveResource with agentsDirs", async () => {
      readFileMock.mockImplementation((...args: unknown[]) => {
        if (args[1] === "utf-8") {
          return Promise.resolve(JSON.stringify({ agentsDirs: ["agents"], allowedFolders: [] }));
        }
        return Promise.reject(new Error("unexpected"));
      });
      const { access } = await import("node:fs/promises");
      const accessMock = vi.mocked(access as unknown as (...args: unknown[]) => Promise<unknown>);
      accessMock.mockResolvedValueOnce(undefined);

      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const resolved = await result.value.resolveAgent("architect");
      expect(resolved).toEqual({ ok: true, value: "agents/architect.md" });
    });
  });

  describe("resolveSkill", () => {
    it("delegates to resolveResource with skillsDirs", async () => {
      readFileMock.mockImplementation((...args: unknown[]) => {
        if (args[1] === "utf-8") {
          return Promise.resolve(JSON.stringify({ skillsDirs: ["skills"], allowedFolders: [] }));
        }
        return Promise.reject(new Error("unexpected"));
      });
      const { access } = await import("node:fs/promises");
      const accessMock = vi.mocked(access as unknown as (...args: unknown[]) => Promise<unknown>);
      accessMock.mockResolvedValueOnce(undefined);

      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const resolved = await result.value.resolveSkill("my-skill");
      expect(resolved).toEqual({ ok: true, value: "skills/my-skill/SKILL.md" });
    });
  });

  describe("readDirectory", () => {
    it("delegates with security options", async () => {
      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([]);

      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const dirResult = await result.value.readDirectory(".");
      expect(dirResult).toEqual({ ok: true, value: [] });
    });
  });

  describe("stat", () => {
    it("delegates with security options", async () => {
      const { stat } = await import("node:fs/promises");
      const statMock = vi.mocked(stat as unknown as (...args: unknown[]) => Promise<unknown>);
      statMock.mockResolvedValueOnce({
        isDirectory: () => false,
        mtimeMs: 1000,
        ctimeMs: 2000,
        size: 42,
      });

      const result = await LocalIndexTracker.create(mockCLI());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const statResult = await result.value.stat("notes/foo.md");
      expect(statResult).toEqual({
        ok: true,
        value: { type: "file", mtime: 1000, ctime: 2000, size: 42 },
      });
    });
  });

  describe("listSkills", () => {
    async function createTrackerWithSkills(skillsDirs: string[]) {
      readFileMock.mockImplementation((...args: unknown[]) => {
        if (args[1] === "utf-8") {
          return Promise.resolve(JSON.stringify({ skillsDirs, allowedFolders: [] }));
        }
        return Promise.reject(new Error("unexpected"));
      });
      const result = await LocalIndexTracker.create(mockCLI());
      if (!result.ok) throw new Error("Failed to create tracker");
      return result.value;
    }

    it("enumerates skills from single skillsDir", async () => {
      const tracker = await createTrackerWithSkills(["skills"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([
        { name: "deploy", isDirectory: () => true },
        { name: "review", isDirectory: () => true },
      ]);

      readFileMock
        .mockResolvedValueOnce(
          Buffer.from("---\ndescription: Deploy helper\n---\nDeploy content"),
        )
        .mockResolvedValueOnce(Buffer.from("---\ndescription: Code reviewer\n---\nReview content"));

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
      expect(result.value[0]).toEqual({
        name: "deploy",
        description: "Deploy helper",
        vaultRelativePath: "skills/deploy/SKILL.md",
      });
      expect(result.value[1]).toEqual({
        name: "review",
        description: "Code reviewer",
        vaultRelativePath: "skills/review/SKILL.md",
      });
    });

    it("deduplicates across multiple skillsDirs (first wins)", async () => {
      const tracker = await createTrackerWithSkills(["skills-a", "skills-b"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock
        .mockResolvedValueOnce([{ name: "deploy", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "deploy", isDirectory: () => true }]);

      readFileMock.mockResolvedValueOnce(
        Buffer.from("---\ndescription: First deploy\n---\nContent A"),
      );

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].description).toBe("First deploy");
      expect(result.value[0].vaultRelativePath).toBe("skills-a/deploy/SKILL.md");
    });

    it("skips subdirs without SKILL.md", async () => {
      const tracker = await createTrackerWithSkills(["skills"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([
        { name: "broken", isDirectory: () => true },
        { name: "valid", isDirectory: () => true },
      ]);

      readFileMock
        .mockRejectedValueOnce(
          Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
        )
        .mockResolvedValueOnce(Buffer.from("---\ndescription: Valid skill\n---\nContent"));

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].name).toBe("valid");
    });

    it("uses default description when no frontmatter", async () => {
      const tracker = await createTrackerWithSkills(["skills"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([{ name: "plain", isDirectory: () => true }]);

      readFileMock.mockResolvedValueOnce(Buffer.from("No frontmatter here"));

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value[0].description).toBe("Obsidian vault skill: plain");
    });

    it("returns empty list when skillsDirs is empty", async () => {
      const tracker = await createTrackerWithSkills([]);

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it("skips non-directory entries", async () => {
      const tracker = await createTrackerWithSkills(["skills"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([
        { name: "readme.md", isDirectory: () => false },
        { name: "actual-skill", isDirectory: () => true },
      ]);

      readFileMock.mockResolvedValueOnce(
        Buffer.from("---\ndescription: Actual\n---\nContent"),
      );

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].name).toBe("actual-skill");
    });

    it("continues when a skillsDir fails to enumerate", async () => {
      const tracker = await createTrackerWithSkills(["bad-dir", "good-dir"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock
        .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
        .mockResolvedValueOnce([{ name: "deploy", isDirectory: () => true }]);

      readFileMock.mockResolvedValueOnce(
        Buffer.from("---\ndescription: From good dir\n---\nContent"),
      );

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].name).toBe("deploy");
      expect(result.value[0].vaultRelativePath).toBe("good-dir/deploy/SKILL.md");
    });

    it("collects distinct skills from multiple skillsDirs", async () => {
      const tracker = await createTrackerWithSkills(["dir-a", "dir-b"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock
        .mockResolvedValueOnce([{ name: "alpha", isDirectory: () => true }])
        .mockResolvedValueOnce([{ name: "beta", isDirectory: () => true }]);

      readFileMock
        .mockResolvedValueOnce(Buffer.from("---\ndescription: Alpha skill\n---\nA"))
        .mockResolvedValueOnce(Buffer.from("---\ndescription: Beta skill\n---\nB"));

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
      expect(result.value.map((s) => s.name)).toEqual(["alpha", "beta"]);
    });

    it("skips skill names with unsafe characters", async () => {
      const tracker = await createTrackerWithSkills(["skills"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([
        { name: "good-skill", isDirectory: () => true },
        { name: "bad;name", isDirectory: () => true },
        { name: "$(evil)", isDirectory: () => true },
        { name: "has spaces", isDirectory: () => true },
      ]);

      readFileMock.mockResolvedValueOnce(
        Buffer.from("---\ndescription: Good\n---\nContent"),
      );

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].name).toBe("good-skill");
    });

    it("extracts description with leading/trailing whitespace", async () => {
      const tracker = await createTrackerWithSkills(["skills"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([{ name: "spaced", isDirectory: () => true }]);

      readFileMock.mockResolvedValueOnce(
        Buffer.from("---\ndescription:   Spaced description   \n---\nContent"),
      );

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value[0].description).toBe("Spaced description");
    });

    it("uses default description when description is empty in frontmatter", async () => {
      const tracker = await createTrackerWithSkills(["skills"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([{ name: "empty-desc", isDirectory: () => true }]);

      readFileMock.mockResolvedValueOnce(
        Buffer.from("---\ndescription:   \n---\nContent"),
      );

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value[0].description).toBe("Obsidian vault skill: empty-desc");
    });

    it("ignores description outside frontmatter block", async () => {
      const tracker = await createTrackerWithSkills(["skills"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([{ name: "body-desc", isDirectory: () => true }]);

      readFileMock.mockResolvedValueOnce(
        Buffer.from("No frontmatter\ndescription: Should be ignored\nMore content"),
      );

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value[0].description).toBe("Obsidian vault skill: body-desc");
    });

    it("handles unclosed frontmatter gracefully", async () => {
      const tracker = await createTrackerWithSkills(["skills"]);

      const { readdir } = await import("node:fs/promises");
      const readdirMock = vi.mocked(readdir as unknown as (...args: unknown[]) => Promise<unknown>);
      readdirMock.mockResolvedValueOnce([{ name: "unclosed", isDirectory: () => true }]);

      readFileMock.mockResolvedValueOnce(
        Buffer.from("---\ndescription: Never closed\nsome: other\n"),
      );

      const result = await tracker.listSkills();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value[0].description).toBe("Obsidian vault skill: unclosed");
    });
  });

  describe("watching", () => {
    it("stores cli from create", async () => {
      const cli = mockCLI();
      const result = await LocalIndexTracker.create(cli);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.cli).toBe(cli);
    });
  });
});
