import { describe, expect, it } from "vitest";

import { CLAUDE_HAIKU, CLAUDE_SONNET } from "./model-mapping.js";
import {
  extractFrontmatter,
  extractFrontmatterDescription,
  extractFrontmatterField,
  extractCuratedFrontmatter,
  formatCuratedLines,
  MODEL_LINE_RE,
  remapModelLine,
} from "./frontmatter.js";

describe("extractFrontmatter", () => {
  it("extracts frontmatter block", () => {
    expect(extractFrontmatter("---\nfoo: bar\n---\nbody")).toBe("foo: bar");
  });

  it("returns undefined when no opening delimiter", () => {
    expect(extractFrontmatter("no frontmatter here")).toBeUndefined();
  });

  it("returns undefined when unclosed", () => {
    expect(extractFrontmatter("---\nfoo: bar\n")).toBeUndefined();
  });

  it("handles multi-line frontmatter", () => {
    const content = "---\nfoo: bar\nbaz: qux\n---\nbody";
    expect(extractFrontmatter(content)).toBe("foo: bar\nbaz: qux");
  });
});

describe("extractFrontmatterField", () => {
  it("extracts matching field", () => {
    const content = "---\nmodel: gpt-4o\n---\nbody";
    expect(extractFrontmatterField(content, MODEL_LINE_RE)).toBe("gpt-4o");
  });

  it("trims whitespace from value", () => {
    const content = "---\nmodel:   gpt-4o   \n---\nbody";
    expect(extractFrontmatterField(content, MODEL_LINE_RE)).toBe("gpt-4o");
  });

  it("returns undefined when field absent", () => {
    const content = "---\nname: test\n---\nbody";
    expect(extractFrontmatterField(content, MODEL_LINE_RE)).toBeUndefined();
  });

  it("returns undefined when field is empty", () => {
    const content = "---\nmodel:   \n---\nbody";
    expect(extractFrontmatterField(content, MODEL_LINE_RE)).toBeUndefined();
  });

  it("returns undefined when no frontmatter", () => {
    expect(extractFrontmatterField("just body", MODEL_LINE_RE)).toBeUndefined();
  });
});

describe("extractFrontmatterDescription", () => {
  it("extracts description", () => {
    const content = "---\ndescription: Deploy helper\n---\nbody";
    expect(extractFrontmatterDescription(content)).toBe("Deploy helper");
  });

  it("returns undefined when absent", () => {
    const content = "---\nname: test\n---\nbody";
    expect(extractFrontmatterDescription(content)).toBeUndefined();
  });

  it("ignores description outside frontmatter", () => {
    const content = "no frontmatter\ndescription: ignored";
    expect(extractFrontmatterDescription(content)).toBeUndefined();
  });
});

describe("extractCuratedFrontmatter", () => {
  it("extracts all curated fields", () => {
    const content = [
      "---",
      "name: deploy",
      "model: gemini-3-flash-preview",
      "allowed-tools: Bash, Read",
      'argument-hint: "pass the target"',
      "---",
      "body",
    ].join("\n");

    const result = extractCuratedFrontmatter(content);
    expect(result).toEqual({
      model: "gemini-3-flash-preview",
      allowedTools: "Bash, Read",
      argumentHint: '"pass the target"',
    });
  });

  it("returns only present fields", () => {
    const content = "---\nmodel: gpt-4o\n---\nbody";
    const result = extractCuratedFrontmatter(content);
    expect(result).toEqual({ model: "gpt-4o" });
    expect(result).not.toHaveProperty("allowedTools");
    expect(result).not.toHaveProperty("argumentHint");
  });

  it("returns empty object when no curated fields", () => {
    const content = "---\nname: test\n---\nbody";
    expect(extractCuratedFrontmatter(content)).toEqual({});
  });

  it("returns empty object when no frontmatter", () => {
    expect(extractCuratedFrontmatter("just body")).toEqual({});
  });

  it("extracts allowed-tools without model", () => {
    const content = "---\nallowed-tools: Bash\n---\nbody";
    expect(extractCuratedFrontmatter(content)).toEqual({ allowedTools: "Bash" });
  });
});

describe("formatCuratedLines", () => {
  it("returns empty array for empty curated object", () => {
    expect(formatCuratedLines({})).toEqual([]);
  });

  it("formats model with Claude mapping applied", () => {
    expect(formatCuratedLines({ model: "gpt-4o" })).toEqual([`model: ${CLAUDE_SONNET}`]);
  });

  it("formats allowed-tools field only", () => {
    expect(formatCuratedLines({ allowedTools: "Bash, Read" })).toEqual([
      "allowed-tools: Bash, Read",
    ]);
  });

  it("formats argument-hint field only", () => {
    expect(formatCuratedLines({ argumentHint: '"pass target"' })).toEqual([
      'argument-hint: "pass target"',
    ]);
  });

  it("formats all three fields in correct order", () => {
    const result = formatCuratedLines({
      model: "gemini-2.0-flash-lite",
      allowedTools: "Bash",
      argumentHint: '"arg"',
    });
    expect(result).toEqual([
      `model: ${CLAUDE_HAIKU}`,
      "allowed-tools: Bash",
      'argument-hint: "arg"',
    ]);
  });

  it("maps non-Claude model to Claude equivalent", () => {
    expect(formatCuratedLines({ model: "gpt-4o-mini" })).toEqual([`model: ${CLAUDE_HAIKU}`]);
  });
});

describe("remapModelLine", () => {
  it("replaces non-Claude model with mapped value", () => {
    expect(remapModelLine("model: gemini-3-flash-preview")).toBe(`model: ${CLAUDE_SONNET}`);
  });

  it("passes through Claude models unchanged", () => {
    expect(remapModelLine("model: sonnet")).toBe("model: sonnet");
  });

  it("preserves full Claude model name", () => {
    expect(remapModelLine("model: claude-sonnet-4-6")).toBe("model: claude-sonnet-4-6");
  });

  it("returns unchanged when no model line", () => {
    const input = "name: test\ndescription: foo";
    expect(remapModelLine(input)).toBe(input);
  });

  it("preserves surrounding lines", () => {
    const input = "name: test\nmodel: gpt-4o\ndescription: foo";
    expect(remapModelLine(input)).toBe(`name: test\nmodel: ${CLAUDE_SONNET}\ndescription: foo`);
  });

  it("handles model with extra whitespace", () => {
    expect(remapModelLine("model:   gpt-4o-mini  ")).toBe(`model: ${CLAUDE_HAIKU}`);
  });
});
