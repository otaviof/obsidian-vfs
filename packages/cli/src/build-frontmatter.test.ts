import { describe, expect, it } from "vitest";

import {
  buildFrontmatter,
  NO_OVERRIDES,
  parseFrontmatterOverrides,
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
  it("no source lines, no overrides: produces name + description", () => {
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: [],
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    expect(lines).toEqual(["name: deploy", "description: Deploy helper"]);
  });

  it("source lines with model, remapModel=true: model remapped", () => {
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: ["model: gpt-4o"],
      remapModel: true,
      overrides: NO_OVERRIDES,
    });
    expect(lines).toContain("model: sonnet");
    expect(lines).not.toContain("model: gpt-4o");
  });

  it("source lines with model, remapModel=false: model preserved", () => {
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: ["model: haiku"],
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    expect(lines).toContain("model: haiku");
  });

  it("--set model=opus replaces mapped model", () => {
    const overrides = { set: new Map([["model", "opus"]]), unset: new Set<string>() };
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: ["model: gpt-4o"],
      remapModel: true,
      overrides,
    });
    expect(lines).toContain("model: opus");
    expect(lines).not.toContain("model: sonnet");
  });

  it("--set description=custom replaces default description", () => {
    const overrides = { set: new Map([["description", "custom"]]), unset: new Set<string>() };
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: [],
      remapModel: false,
      overrides,
    });
    expect(lines).toContain("description: custom");
    expect(lines).not.toContain("description: Deploy helper");
  });

  it("--unset model removes model line", () => {
    const overrides = { set: new Map<string, string>(), unset: new Set(["model"]) };
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: ["model: sonnet"],
      remapModel: false,
      overrides,
    });
    expect(lines.some((l) => l.startsWith("model:"))).toBe(false);
  });

  it("--unset description removes description entirely", () => {
    const overrides = { set: new Map<string, string>(), unset: new Set(["description"]) };
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: [],
      remapModel: false,
      overrides,
    });
    expect(lines.some((l) => l.startsWith("description:"))).toBe(false);
    expect(lines).toEqual(["name: deploy"]);
  });

  it("--set context=fork appends new key", () => {
    const overrides = { set: new Map([["context", "fork"]]), unset: new Set<string>() };
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: [],
      remapModel: false,
      overrides,
    });
    expect(lines).toContain("context: fork");
  });

  it("name is always enforced regardless of overrides", () => {
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: ["name: wrong-name"],
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    expect(lines).toContain("name: deploy");
    expect(lines).not.toContain("name: wrong-name");
  });

  it("preserves line order; new keys appended at end", () => {
    const overrides = { set: new Map([["context", "fork"]]), unset: new Set<string>() };
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: ["model: sonnet", "allowed-tools: Bash"],
      remapModel: false,
      overrides,
    });
    const modelIdx = lines.indexOf("model: sonnet");
    const toolsIdx = lines.indexOf("allowed-tools: Bash");
    const contextIdx = lines.indexOf("context: fork");
    expect(modelIdx).toBeLessThan(toolsIdx);
    expect(toolsIdx).toBeLessThan(contextIdx);
  });

  it("combined --set + --unset on different keys", () => {
    const overrides = { set: new Map([["model", "opus"]]), unset: new Set(["allowed-tools"]) };
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: ["model: sonnet", "allowed-tools: Bash"],
      remapModel: false,
      overrides,
    });
    expect(lines).toContain("model: opus");
    expect(lines.some((l) => l.startsWith("allowed-tools:"))).toBe(false);
  });

  it("empty overrides: identity (source lines + name + description defaults)", () => {
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: ["model: sonnet", "allowed-tools: Bash"],
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    expect(lines).toEqual([
      "name: deploy",
      "description: Deploy helper",
      "model: sonnet",
      "allowed-tools: Bash",
    ]);
  });

  it("agent with no frontmatter + --set model=opus", () => {
    const overrides = { set: new Map([["model", "opus"]]), unset: new Set<string>() };
    const lines = buildFrontmatter({
      name: "architect",
      description: "System architect",
      sourceLines: [],
      remapModel: true,
      overrides,
    });
    expect(lines).toContain("name: architect");
    expect(lines).toContain("description: System architect");
    expect(lines).toContain("model: opus");
  });

  it("agent with no frontmatter + --unset description", () => {
    const overrides = { set: new Map<string, string>(), unset: new Set(["description"]) };
    const lines = buildFrontmatter({
      name: "architect",
      description: "System architect",
      sourceLines: [],
      remapModel: true,
      overrides,
    });
    expect(lines).toEqual(["name: architect"]);
  });

  it("source lines with existing description: no duplicate added", () => {
    const lines = buildFrontmatter({
      name: "deploy",
      description: "Deploy helper",
      sourceLines: ["description: Vault desc", "model: sonnet"],
      remapModel: false,
      overrides: NO_OVERRIDES,
    });
    const descLines = lines.filter((l) => l.startsWith("description:"));
    expect(descLines).toHaveLength(1);
    expect(descLines[0]).toBe("description: Vault desc");
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
