import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("esbuild configuration", () => {
  const esbuildConfigPath = resolve(import.meta.dirname, "../esbuild.mjs");

  it("esbuild config file exists", () => {
    expect(() => readFileSync(esbuildConfigPath, "utf8")).not.toThrow();
  });

  it("esbuild config targets ESM output", () => {
    const config = readFileSync(esbuildConfigPath, "utf8");
    expect(config).toContain('format: "esm"');
  });

  it("esbuild config targets node platform", () => {
    const config = readFileSync(esbuildConfigPath, "utf8");
    expect(config).toContain('platform: "node"');
  });

  it("esbuild config produces bundle output", () => {
    const config = readFileSync(esbuildConfigPath, "utf8");
    expect(config).toContain("bundle: true");
    expect(config).toContain('outfile: "bundle/hook-handler.mjs"');
  });

  it("esbuild config entry point is hook-handler", () => {
    const config = readFileSync(esbuildConfigPath, "utf8");
    expect(config).toContain('entryPoints: ["src/hook-handler.ts"]');
  });

  it("esbuild config targets node22", () => {
    const config = readFileSync(esbuildConfigPath, "utf8");
    expect(config).toContain('target: "node22"');
  });

  it("esbuild config disables sourcemap", () => {
    const config = readFileSync(esbuildConfigPath, "utf8");
    expect(config).toContain("sourcemap: false");
  });
});
