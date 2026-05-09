import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("bundle integrity", () => {
  const bundlePath = resolve(import.meta.dirname, "../bundle/hook-handler.mjs");

  it("bundle file exists and is executable", () => {
    expect(() => accessSync(bundlePath, constants.F_OK)).not.toThrow();
    expect(() => accessSync(bundlePath, constants.R_OK)).not.toThrow();
    expect(() => accessSync(bundlePath, constants.X_OK)).not.toThrow();
  });

  it("bundle is valid ESM with shebang", () => {
    const content = readFileSync(bundlePath, "utf8");
    expect(content).toMatch(/^#!\/usr\/bin\/env node/);
    expect(content).not.toContain('require("');
    expect(content).not.toContain('module.exports');
  });

  it("bundle has no external package dependencies", () => {
    const content = readFileSync(bundlePath, "utf8");
    expect(content).not.toContain('from "@obsidian-vfs');
    expect(content).not.toContain('import("@obsidian-vfs');
  });

  it("bundle uses node built-in modules", () => {
    const content = readFileSync(bundlePath, "utf8");
    expect(content).toContain('from "node:');
  });

  it("bundle contains core logic inlined", () => {
    const content = readFileSync(bundlePath, "utf8");
    expect(content).toContain("MENTION_PREFIX");
    expect(content).toContain("SKILL_PREFIX");
    expect(content).toContain("resolveMention");
  });

  it("bundle size is reasonable (under 200KB)", () => {
    const stats = statSync(bundlePath);
    expect(stats.size).toBeGreaterThan(1000);
    expect(stats.size).toBeLessThan(200_000);
  });

  it("bundle can be imported as ESM module", async () => {
    await expect(import(bundlePath)).resolves.toBeDefined();
  });

  it("bundle file matches bin script reference", () => {
    const binPath = resolve(import.meta.dirname, "../../../bin/obs-hook-handler");
    const binContent = readFileSync(binPath, "utf8");
    expect(binContent).toContain("bundle/hook-handler.mjs");
  });
});
