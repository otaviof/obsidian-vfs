import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { detectProxy } from "./proxy-detector.js";

describe("detectProxy", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "proxy-detect-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("detects a vault proxy SKILL.md", async () => {
    const skillDir = join(cwd, ".claude", "skills", "spike-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      '---\ndescription: test\n---\n!`npx --yes @obsidian-vfs/cli inspect --body "/obs:spike-skill"`\n',
    );

    const result = await detectProxy("spike-skill", cwd);
    expect(result).not.toBeNull();
    expect(result!.isProxy).toBe(true);
    expect(result!.skillName).toBe("spike-skill");
    expect(result!.obsMention).toBe("/obs:spike-skill");
  });

  it("returns null for non-existent skill directory", async () => {
    const result = await detectProxy("nonexistent", cwd);
    expect(result).toBeNull();
  });

  it("returns null for SKILL.md without obs-read pattern", async () => {
    const skillDir = join(cwd, ".claude", "skills", "other-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\ndescription: A regular skill\n---\nDo something.\n",
    );

    const result = await detectProxy("other-skill", cwd);
    expect(result).toBeNull();
  });

  it("extracts correct skill name from the command line", async () => {
    const skillDir = join(cwd, ".claude", "skills", "my-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      '!`npx --yes @obsidian-vfs/cli inspect --body "/obs:custom-name"`\n',
    );

    const result = await detectProxy("my-skill", cwd);
    expect(result).not.toBeNull();
    expect(result!.skillName).toBe("custom-name");
    expect(result!.obsMention).toBe("/obs:custom-name");
  });

  it("rejects path traversal in command name", async () => {
    const result = await detectProxy("../../../etc/passwd", cwd);
    expect(result).toBeNull();
  });

  it("handles SKILL.md with extra whitespace in command", async () => {
    const skillDir = join(cwd, ".claude", "skills", "ws-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      '!`npx @obsidian-vfs/cli inspect  --body  "/obs:ws-skill"`\n',
    );

    const result = await detectProxy("ws-skill", cwd);
    expect(result).not.toBeNull();
    expect(result!.skillName).toBe("ws-skill");
  });
});
