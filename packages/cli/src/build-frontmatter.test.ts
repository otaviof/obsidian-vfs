import { describe, expect, it } from "vitest";

import {
  buildFrontmatter,
  NO_OVERRIDES,
  parseFrontmatterOverrides,
  pickCuratedKeys,
  splitFrontmatterAndBody,
} from "./build-frontmatter.js";

describe("parseFrontmatterOverrides", () => {
  it("returns NO_OVERRIDES for empty arrays", () => {
    const result = parseFrontmatterOverrides([], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(NO_OVERRIDES);
    }
  });

  it("parses a single --set pair", () => {
    const result = parseFrontmatterOverrides(["model=opus"], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.set.get("model")).toBe("opus");
    }
  });

  it("parses multiple --set pairs", () => {
    const result = parseFrontmatterOverrides(["model=opus", "allowed-tools=Bash"], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.set.get("model")).toBe("opus");
      expect(result.value.set.get("allowed-tools")).toBe("Bash");
    }
  });

  it("splits on first = only (value may contain =)", () => {
    const result = parseFrontmatterOverrides(["foo=a=b"], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.set.get("foo")).toBe("a=b");
    }
  });

  it("duplicate --set key: last wins", () => {
    const result = parseFrontmatterOverrides(["model=opus", "model=haiku"], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.set.get("model")).toBe("haiku");
    }
  });

  it("rejects --set without =", () => {
    const result = parseFrontmatterOverrides(["model"], []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("missing '='");
    }
  });

  it("rejects --set with empty key", () => {
    const result = parseFrontmatterOverrides(["=opus"], []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("empty key");
    }
  });

  it("rejects --set with empty value", () => {
    const result = parseFrontmatterOverrides(["model="], []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("empty value");
    }
  });

  it("rejects --set name (protected key)", () => {
    const result = parseFrontmatterOverrides(["name=other"], []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Cannot override protected key 'name'");
    }
  });

  it("parses a valid --unset key", () => {
    const result = parseFrontmatterOverrides([], ["model"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.unset.has("model")).toBe(true);
    }
  });

  it("duplicate --unset keys are deduplicated", () => {
    const result = parseFrontmatterOverrides([], ["model", "model"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.unset.size).toBe(1);
    }
  });

  it("rejects --unset with empty key", () => {
    const result = parseFrontmatterOverrides([], [""]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("empty key");
    }
  });

  it("rejects --unset name (protected key)", () => {
    const result = parseFrontmatterOverrides([], ["name"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Cannot unset protected key 'name'");
    }
  });

  it("rejects key in both --set and --unset", () => {
    const result = parseFrontmatterOverrides(["model=opus"], ["model"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Key 'model' appears in both --set and --unset");
    }
  });

  it("accepts arbitrary keys (e.g. context=fork)", () => {
    const result = parseFrontmatterOverrides(["context=fork"], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.set.get("context")).toBe("fork");
    }
  });
});

describe("buildFrontmatter", () => {
  it("no source, no overrides: produces name + description", () => {
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: {},
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    expect(result).toBe("name: deploy\ndescription: Deploy helper");
  });

  it("source with model, remapModel=true: model remapped", () => {
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { model: "gpt-4o" },
      remapModel: true,
      overrides: NO_OVERRIDES,
    });
    expect(result).toContain("model: sonnet");
    expect(result).not.toContain("gpt-4o");
  });

  it("source with model, remapModel=false: model preserved", () => {
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { model: "haiku" },
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    expect(result).toContain("model: haiku");
  });

  it("--set model=opus replaces mapped model", () => {
    const overrides = { set: new Map([["model", "opus"]]), unset: new Set<string>() };
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { model: "gpt-4o" },
      remapModel: true,
      overrides,
    });
    expect(result).toContain("model: opus");
    expect(result).not.toContain("model: sonnet");
  });

  it("--set description=custom replaces default description", () => {
    const overrides = { set: new Map([["description", "custom"]]), unset: new Set<string>() };
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: {},
      remapModel: false,
      overrides,
    });
    expect(result).toContain("description: custom");
    expect(result).not.toContain("description: Deploy helper");
  });

  it("--unset model removes model", () => {
    const overrides = { set: new Map<string, string>(), unset: new Set(["model"]) };
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { model: "sonnet" },
      remapModel: false,
      overrides,
    });
    expect(result).not.toContain("model:");
  });

  it("--unset description removes description entirely", () => {
    const overrides = { set: new Map<string, string>(), unset: new Set(["description"]) };
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: {},
      remapModel: false,
      overrides,
    });
    expect(result).not.toContain("description:");
    expect(result).toBe("name: deploy");
  });

  it("--set context=fork appends new key", () => {
    const overrides = { set: new Map([["context", "fork"]]), unset: new Set<string>() };
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: {},
      remapModel: false,
      overrides,
    });
    expect(result).toContain("context: fork");
  });

  it("name is always enforced regardless of overrides", () => {
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { name: "wrong-name" },
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    expect(result).toContain("name: deploy");
    expect(result).not.toContain("name: wrong-name");
  });

  it("preserves key order; new keys appended at end", () => {
    const overrides = { set: new Map([["context", "fork"]]), unset: new Set<string>() };
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { model: "sonnet", "allowed-tools": "Bash" },
      remapModel: false,
      overrides,
    });
    const modelIdx = result.indexOf("model: sonnet");
    const toolsIdx = result.indexOf("allowed-tools: Bash");
    const contextIdx = result.indexOf("context: fork");
    expect(modelIdx).toBeLessThan(toolsIdx);
    expect(toolsIdx).toBeLessThan(contextIdx);
  });

  it("combined --set + --unset on different keys", () => {
    const overrides = { set: new Map([["model", "opus"]]), unset: new Set(["allowed-tools"]) };
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { model: "sonnet", "allowed-tools": "Bash" },
      remapModel: false,
      overrides,
    });
    expect(result).toContain("model: opus");
    expect(result).not.toContain("allowed-tools:");
  });

  it("empty overrides: identity (source + name + description defaults)", () => {
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { model: "sonnet", "allowed-tools": "Bash" },
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    expect(result).toBe(
      "name: deploy\ndescription: Deploy helper\nmodel: sonnet\nallowed-tools: Bash",
    );
  });

  it("agent with no frontmatter + --set model=opus", () => {
    const overrides = { set: new Map([["model", "opus"]]), unset: new Set<string>() };
    const result = buildFrontmatter({
      name: "architect",
      description: "System architect",
      source: {},
      remapModel: true,
      overrides,
    });
    expect(result).toContain("name: architect");
    expect(result).toContain("description: System architect");
    expect(result).toContain("model: opus");
  });

  it("agent with no frontmatter + --unset description", () => {
    const overrides = { set: new Map<string, string>(), unset: new Set(["description"]) };
    const result = buildFrontmatter({
      name: "architect",
      description: "System architect",
      source: {},
      remapModel: true,
      overrides,
    });
    expect(result).toBe("name: architect");
  });

  it("source with existing description: no duplicate added", () => {
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { description: "Vault desc", model: "sonnet" },
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    const descMatches = result.match(/description:/g);
    expect(descMatches).toHaveLength(1);
    expect(result).toContain("description: Vault desc");
  });

  it("multi-line description preserved as block scalar", () => {
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { description: "Line one\nLine two" },
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    expect(result).toContain("Line one");
    expect(result).toContain("Line two");
    expect(result).not.toContain("Deploy helper");
  });

  it("--unset removes multi-line value completely", () => {
    const overrides = { set: new Map<string, string>(), unset: new Set(["description"]) };
    const result = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      source: { description: "Line one\nLine two" },
      remapModel: false,
      overrides,
    });
    expect(result).not.toContain("description");
    expect(result).not.toContain("Line one");
    expect(result).not.toContain("Line two");
  });
});

describe("pickCuratedKeys", () => {
  it("filters to curated keys only", () => {
    const result = pickCuratedKeys({
      model: "sonnet",
      "allowed-tools": "Bash, Read",
      "argument-hint": "pass the target",
      description: "Some desc",
      name: "deploy",
      tools: "Read, Grep",
      extra: "should be dropped",
    });
    expect(result).toEqual({
      model: "sonnet",
      "allowed-tools": "Bash, Read",
      "argument-hint": "pass the target",
    });
  });

  it("returns empty Record for empty input", () => {
    expect(pickCuratedKeys({})).toEqual({});
  });

  it("excludes name, description, tools, and other non-curated keys", () => {
    const result = pickCuratedKeys({
      name: "deploy",
      description: "Helper",
      tools: "Read",
      context: "fork",
    });
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("splitFrontmatterAndBody", () => {
  it("content with frontmatter: returns both parts", () => {
    const content = "---\nfoo: bar\n---\nBody text.\n";
    const { frontmatter, body } = splitFrontmatterAndBody(content);
    expect(frontmatter).toBe("foo: bar");
    expect(body).toBe("Body text.\n");
  });

  it("content without frontmatter: returns undefined + full body", () => {
    const content = "Just body content.\n";
    const { frontmatter, body } = splitFrontmatterAndBody(content);
    expect(frontmatter).toBeUndefined();
    expect(body).toBe(content);
  });

  it("content with unclosed frontmatter: returns undefined + full body", () => {
    const content = "---\nfoo: bar\nBody text.\n";
    const { frontmatter, body } = splitFrontmatterAndBody(content);
    expect(frontmatter).toBeUndefined();
    expect(body).toBe(content);
  });
});
