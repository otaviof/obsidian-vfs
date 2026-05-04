import { accessSync, constants, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("obs-hook-handler", () => {
  it("hooks.json references the correct command", () => {
    const hooksPath = resolve(import.meta.dirname, "../../../hooks/hooks.json");
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8")) as {
      hooks: { UserPromptSubmit: { hooks: { command: string }[] }[] };
    };
    const command = hooks.hooks.UserPromptSubmit[0].hooks[0].command;
    expect(command).toBe("${CLAUDE_PLUGIN_ROOT}/bin/obs-hook-handler");
  });

  it("bin/obs-hook-handler script exists and is executable", () => {
    const binPath = resolve(import.meta.dirname, "../../../bin/obs-hook-handler");
    const content = readFileSync(binPath, "utf8");
    expect(content).toContain("#!/usr/bin/env node");
    expect(content).toContain("hook-handler.js");
    expect(() => accessSync(binPath, constants.X_OK)).not.toThrow();
  });

  it("bin/obs-read script exists and is executable", () => {
    const binPath = resolve(import.meta.dirname, "../../../bin/obs-read");
    const content = readFileSync(binPath, "utf8");
    expect(content).toContain("#!/usr/bin/env node");
    expect(content).toContain("obs-read-main.js");
    expect(() => accessSync(binPath, constants.X_OK)).not.toThrow();
  });
});
