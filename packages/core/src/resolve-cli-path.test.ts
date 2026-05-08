import { describe, expect, it } from "vitest";

import {
  OBSIDIAN_VFS_CLI_PATH,
  PLATFORM_OBSIDIAN_VFS_CLI_PATHS,
  resolveCliPath,
} from "./resolve-cli-path.js";

describe("resolveCliPath", () => {
  it("returns user path when provided", () => {
    const result = resolveCliPath({ userPath: "/custom/obsidian" });
    expect(result).toBe("/custom/obsidian");
  });

  it("returns env var when set", () => {
    const result = resolveCliPath({ env: { OBSIDIAN_VFS_CLI_PATH: "/env/obs" } });
    expect(result).toBe("/env/obs");
  });

  it("user path takes priority over env var", () => {
    const result = resolveCliPath({
      userPath: "/custom/obs",
      env: { OBSIDIAN_VFS_CLI_PATH: "/env/obs" },
    });
    expect(result).toBe("/custom/obs");
  });

  it("returns macOS default on darwin", () => {
    const result = resolveCliPath({ platform: "darwin", env: {} });
    expect(result).toBe("/Applications/Obsidian.app/Contents/MacOS/obsidian-cli");
  });

  it("returns Linux default on linux", () => {
    const result = resolveCliPath({ platform: "linux", env: {} });
    expect(result).toBe("/usr/local/bin/obsidian");
  });

  it("returns bare executable on unknown platform", () => {
    const result = resolveCliPath({ platform: "win32", env: {} });
    expect(result).toBe("obsidian");
  });

  it("ignores empty user path", () => {
    const result = resolveCliPath({ userPath: "", platform: "darwin", env: {} });
    expect(result).toBe("/Applications/Obsidian.app/Contents/MacOS/obsidian-cli");
  });

  it("ignores empty env var", () => {
    const result = resolveCliPath({ env: { OBSIDIAN_VFS_CLI_PATH: "" }, platform: "linux" });
    expect(result).toBe("/usr/local/bin/obsidian");
  });

  it("env var takes priority over platform default", () => {
    const result = resolveCliPath({
      env: { OBSIDIAN_VFS_CLI_PATH: "/snap/bin/obsidian" },
      platform: "linux",
    });
    expect(result).toBe("/snap/bin/obsidian");
  });

  it("falls back to process.env when env option is omitted", () => {
    const result = resolveCliPath({ platform: "darwin" });
    const expected = process.env[OBSIDIAN_VFS_CLI_PATH] ?? PLATFORM_OBSIDIAN_VFS_CLI_PATHS.darwin;
    expect(result).toBe(expected);
  });
});

describe("constants", () => {
  it("OBSIDIAN_VFS_CLI_PATH is the expected env var name", () => {
    expect(OBSIDIAN_VFS_CLI_PATH).toBe("OBSIDIAN_VFS_CLI_PATH");
  });

  it("PLATFORM_OBSIDIAN_VFS_CLI_PATHS has darwin and linux entries", () => {
    expect(PLATFORM_OBSIDIAN_VFS_CLI_PATHS).toHaveProperty("darwin");
    expect(PLATFORM_OBSIDIAN_VFS_CLI_PATHS).toHaveProperty("linux");
    expect(Object.keys(PLATFORM_OBSIDIAN_VFS_CLI_PATHS)).toHaveLength(2);
  });
});
