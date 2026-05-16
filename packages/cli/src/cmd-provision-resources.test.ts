import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  CLI_PKG,
  buildPermissionRule,
  countPermissionRule,
  provisionPaths,
  readCommand,
  syncPermissionRule,
  userGlobalClaudeDir,
} from "./cmd-provision-resources.js";

const mockMkdir = vi.mocked(mkdir);
const mockReadFile = vi.mocked(readFile as unknown as (...args: unknown[]) => Promise<unknown>);
const mockWriteFile = vi.mocked(writeFile as unknown as (...args: unknown[]) => Promise<unknown>);

describe("cmd-provision-resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OBSIDIAN_VFS_PROJECT_DIR;
  });

  describe("readCommand", () => {
    it("returns unpinned npx command by default", () => {
      const cmd = readCommand(false);
      expect(cmd).toBe(`npx --yes ${CLI_PKG} inspect --body`);
    });

    it("returns versioned npx command when pinned", () => {
      const cmd = readCommand(true);
      expect(cmd).toMatch(new RegExp(`^npx --yes ${CLI_PKG}@\\d+\\.\\d+\\.\\d+.* inspect --body$`));
    });

    it("returns local path when OBSIDIAN_VFS_PROJECT_DIR is set", () => {
      process.env.OBSIDIAN_VFS_PROJECT_DIR = "/my/project";
      expect(readCommand(false)).toBe("/my/project/bin/obs-read");
      expect(readCommand(true)).toBe("/my/project/bin/obs-read");
    });

    it("returns relative path when OBSIDIAN_VFS_PROJECT_DIR is relative", () => {
      process.env.OBSIDIAN_VFS_PROJECT_DIR = ".";
      expect(readCommand(false)).toBe("./bin/obs-read");
    });
  });

  describe("buildPermissionRule", () => {
    it("wraps unpinned readCommand in Bash() glob", () => {
      expect(buildPermissionRule(false)).toBe(`Bash(${readCommand(false)} *)`);
    });

    it("wraps pinned readCommand in Bash() glob", () => {
      expect(buildPermissionRule(true)).toBe(`Bash(${readCommand(true)} *)`);
    });
  });

  describe("userGlobalClaudeDir", () => {
    it("returns ~/.claude", () => {
      expect(userGlobalClaudeDir()).toBe(path.join(os.homedir(), ".claude"));
    });
  });

  describe("provisionPaths", () => {
    it("returns project-local paths when user=false", () => {
      const result = provisionPaths(false);
      expect(result.baseDir).toBe(".claude");
      expect(result.settingsPath).toBe(path.join(".claude", "settings.local.json"));
    });

    it("returns user-global paths when user=true", () => {
      const result = provisionPaths(true);
      expect(result.baseDir).toBe(path.join(os.homedir(), ".claude"));
      expect(result.settingsPath).toBe(path.join(os.homedir(), ".claude", "settings.json"));
    });
  });

  describe("syncPermissionRule", () => {
    it("creates settings from scratch when file missing", async () => {
      const result = await syncPermissionRule("/tmp/settings.json", false);
      expect(result).toEqual({ added: 1 });
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/tmp/settings.json",
        expect.stringContaining(buildPermissionRule(false)),
        "utf-8",
      );
    });

    it("appends rule to existing permissions", async () => {
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ permissions: { allow: ["Bash(echo *)"] } }),
      );

      const result = await syncPermissionRule("/tmp/settings.json", false);
      expect(result).toEqual({ added: 1 });
      const written = JSON.parse(String(mockWriteFile.mock.calls[0][1])) as {
        permissions: { allow: string[] };
      };
      expect(written.permissions.allow).toContain("Bash(echo *)");
      expect(written.permissions.allow).toContain(buildPermissionRule(false));
    });

    it("skips write when rule already exists", async () => {
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ permissions: { allow: [buildPermissionRule(false)] } }),
      );

      const result = await syncPermissionRule("/tmp/settings.json", false);
      expect(result).toEqual({ added: 0 });
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("creates mkdir for parent directory", async () => {
      await syncPermissionRule("/some/dir/settings.json", false);
      expect(mockMkdir).toHaveBeenCalledWith("/some/dir", { recursive: true });
    });
  });

  describe("countPermissionRule", () => {
    it("returns 1 when settings file missing", async () => {
      const result = await countPermissionRule("/tmp/settings.json", false);
      expect(result).toEqual({ added: 1 });
    });

    it("returns 1 when rule not present", async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ permissions: { allow: [] } }));

      const result = await countPermissionRule("/tmp/settings.json", false);
      expect(result).toEqual({ added: 1 });
    });

    it("returns 0 when rule already present", async () => {
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ permissions: { allow: [buildPermissionRule(false)] } }),
      );

      const result = await countPermissionRule("/tmp/settings.json", false);
      expect(result).toEqual({ added: 0 });
    });

    it("does not write to disk (read-only)", async () => {
      await countPermissionRule("/tmp/settings.json", false);
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockMkdir).not.toHaveBeenCalled();
    });
  });
});
