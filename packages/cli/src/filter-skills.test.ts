import { describe, expect, it } from "vitest";

import { filterSkills, globToRegExp } from "./filter-skills.js";

interface NamedItem {
  readonly name: string;
  readonly description: string;
  readonly vaultRelativePath: string;
}

function makeResource(overrides: Partial<NamedItem> = {}): NamedItem {
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
  const resources = [
    makeResource(),
    makeResource({ name: "review", description: "Reviewer" }),
    makeResource({ name: "draft-notes", description: "Draft notes" }),
    makeResource({ name: "draft-review", description: "Draft review" }),
  ];

  it("returns all items when no filter is set", () => {
    const result = filterSkills(resources, { include: [], exclude: [] });
    expect(result.matched).toEqual(resources);
    expect(result.skipped).toEqual([]);
  });

  it("includes a single item", () => {
    const result = filterSkills(resources, { include: ["deploy"], exclude: [] });
    expect(result.matched.map((s) => s.name)).toEqual(["deploy"]);
    expect(result.skipped).toEqual(["review", "draft-notes", "draft-review"]);
  });

  it("includes multiple items", () => {
    const result = filterSkills(resources, { include: ["deploy", "review"], exclude: [] });
    expect(result.matched.map((s) => s.name)).toEqual(["deploy", "review"]);
    expect(result.skipped).toEqual(["draft-notes", "draft-review"]);
  });

  it("includes with glob pattern", () => {
    const result = filterSkills(resources, { include: ["draft-*"], exclude: [] });
    expect(result.matched.map((s) => s.name)).toEqual(["draft-notes", "draft-review"]);
    expect(result.skipped).toEqual(["deploy", "review"]);
  });

  it("excludes a single item", () => {
    const result = filterSkills(resources, { include: [], exclude: ["deploy"] });
    expect(result.matched.map((s) => s.name)).toEqual(["review", "draft-notes", "draft-review"]);
    expect(result.skipped).toEqual(["deploy"]);
  });

  it("excludes with glob pattern", () => {
    const result = filterSkills(resources, { include: [], exclude: ["draft-*"] });
    expect(result.matched.map((s) => s.name)).toEqual(["deploy", "review"]);
    expect(result.skipped).toEqual(["draft-notes", "draft-review"]);
  });

  it("returns empty matched when include matches nothing", () => {
    const result = filterSkills(resources, { include: ["nonexistent"], exclude: [] });
    expect(result.matched).toEqual([]);
    expect(result.skipped).toEqual(["deploy", "review", "draft-notes", "draft-review"]);
  });

  it("returns all matched when exclude matches nothing", () => {
    const result = filterSkills(resources, { include: [], exclude: ["nonexistent"] });
    expect(result.matched).toEqual(resources);
    expect(result.skipped).toEqual([]);
  });

  it("works with generic named items (agent-shaped)", () => {
    const agents = [
      { name: "architect", description: "Architect", vaultRelativePath: "agents/architect.md" },
      { name: "reviewer", description: "Reviewer", vaultRelativePath: "agents/reviewer.md" },
    ];
    const result = filterSkills(agents, { include: ["architect"], exclude: [] });
    expect(result.matched.map((a) => a.name)).toEqual(["architect"]);
    expect(result.skipped).toEqual(["reviewer"]);
  });
});
