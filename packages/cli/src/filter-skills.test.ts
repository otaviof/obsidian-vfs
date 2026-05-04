import type { DiscoveredSkill } from "@obsidian-vfs/core";
import { describe, expect, it } from "vitest";

import { filterSkills, globToRegExp } from "./filter-skills.js";

function makeSkill(overrides: Partial<DiscoveredSkill> = {}): DiscoveredSkill {
  return {
    name: "deploy",
    description: "Deploy helper",
    vaultRelativePath: "skills/deploy/SKILL.md",
    ...overrides,
  };
}

describe("globToRegExp", () => {
  it("matches exact name", () => {
    const re = globToRegExp("deploy");
    expect(re.test("deploy")).toBe(true);
    expect(re.test("deploy2")).toBe(false);
  });

  it("matches star wildcard", () => {
    const re = globToRegExp("draft-*");
    expect(re.test("draft-notes")).toBe(true);
    expect(re.test("draft-review")).toBe(true);
    expect(re.test("deploy")).toBe(false);
  });

  it("matches question mark", () => {
    const re = globToRegExp("v?");
    expect(re.test("v1")).toBe(true);
    expect(re.test("v2")).toBe(true);
    expect(re.test("v10")).toBe(false);
  });

  it("escapes regex metacharacters", () => {
    const re = globToRegExp("deploy.prod");
    expect(re.test("deploy.prod")).toBe(true);
    expect(re.test("deployprod")).toBe(false);
  });
});

describe("filterSkills", () => {
  const skills = [
    makeSkill(),
    makeSkill({ name: "review", description: "Reviewer" }),
    makeSkill({ name: "draft-notes", description: "Draft notes" }),
    makeSkill({ name: "draft-review", description: "Draft review" }),
  ];

  it("returns all skills when no filter is set", () => {
    const result = filterSkills(skills, { include: [], exclude: [] });
    expect(result.matched).toEqual(skills);
    expect(result.skipped).toEqual([]);
  });

  it("includes a single skill", () => {
    const result = filterSkills(skills, { include: ["deploy"], exclude: [] });
    expect(result.matched.map((s) => s.name)).toEqual(["deploy"]);
    expect(result.skipped).toEqual(["review", "draft-notes", "draft-review"]);
  });

  it("includes multiple skills", () => {
    const result = filterSkills(skills, { include: ["deploy", "review"], exclude: [] });
    expect(result.matched.map((s) => s.name)).toEqual(["deploy", "review"]);
    expect(result.skipped).toEqual(["draft-notes", "draft-review"]);
  });

  it("includes with glob pattern", () => {
    const result = filterSkills(skills, { include: ["draft-*"], exclude: [] });
    expect(result.matched.map((s) => s.name)).toEqual(["draft-notes", "draft-review"]);
    expect(result.skipped).toEqual(["deploy", "review"]);
  });

  it("excludes a single skill", () => {
    const result = filterSkills(skills, { include: [], exclude: ["deploy"] });
    expect(result.matched.map((s) => s.name)).toEqual(["review", "draft-notes", "draft-review"]);
    expect(result.skipped).toEqual(["deploy"]);
  });

  it("excludes with glob pattern", () => {
    const result = filterSkills(skills, { include: [], exclude: ["draft-*"] });
    expect(result.matched.map((s) => s.name)).toEqual(["deploy", "review"]);
    expect(result.skipped).toEqual(["draft-notes", "draft-review"]);
  });

  it("returns empty matched when include matches nothing", () => {
    const result = filterSkills(skills, { include: ["nonexistent"], exclude: [] });
    expect(result.matched).toEqual([]);
    expect(result.skipped).toEqual(["deploy", "review", "draft-notes", "draft-review"]);
  });

  it("returns all matched when exclude matches nothing", () => {
    const result = filterSkills(skills, { include: [], exclude: ["nonexistent"] });
    expect(result.matched).toEqual(skills);
    expect(result.skipped).toEqual([]);
  });
});
