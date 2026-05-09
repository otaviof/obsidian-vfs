import { describe, expect, it } from "vitest";

import { extractObsUris } from "./uri-extractor.js";

describe("extractObsUris", () => {
  it("extracts a bare obs:// URI", () => {
    const result = extractObsUris("See obs://drafts/my-note for details");
    expect(result).toHaveLength(1);
    expect(result[0].vaultName).toBe("drafts");
    expect(result[0].path).toBe("my-note");
    expect(result[0].section).toBeUndefined();
  });

  it("extracts a URI from a markdown link", () => {
    const result = extractObsUris("[display text](obs://drafts/my-note)");
    expect(result).toHaveLength(1);
    expect(result[0].vaultName).toBe("drafts");
    expect(result[0].path).toBe("my-note");
  });

  it("extracts a URI with a section fragment", () => {
    const result = extractObsUris("obs://drafts/bases#Core%20Views%20%28Built-in%29");
    expect(result).toHaveLength(1);
    expect(result[0].vaultName).toBe("drafts");
    expect(result[0].path).toBe("bases");
    expect(result[0].section).toBe("Core Views (Built-in)");
  });

  it("extracts a URI with URL-encoded characters in path", () => {
    const result = extractObsUris("obs://drafts/my%20note");
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("my note");
  });

  it("deduplicates repeated URIs", () => {
    const result = extractObsUris("obs://drafts/note and obs://drafts/note again");
    expect(result).toHaveLength(1);
  });

  it("ignores URIs inside fenced code blocks", () => {
    const result = extractObsUris("```\nobs://drafts/note\n```");
    expect(result).toHaveLength(0);
  });

  it("ignores URIs inside inline code", () => {
    const result = extractObsUris("Use `obs://drafts/note` syntax");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for text with no obs:// URIs", () => {
    const result = extractObsUris("Just a normal paragraph");
    expect(result).toHaveLength(0);
  });

  it("extracts multiple URIs from one text", () => {
    const result = extractObsUris("[A](obs://drafts/a) and [B](obs://drafts/b#Heading)");
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("a");
    expect(result[1].path).toBe("b");
    expect(result[1].section).toBe("Heading");
  });

  it("skips malformed URIs", () => {
    const result = extractObsUris("obs:// and obs://drafts/valid");
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("valid");
  });

  it("extracts URI after a code block", () => {
    const result = extractObsUris("```\ncode\n``` then obs://drafts/real");
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("real");
  });

  it("handles URIs with nested path segments", () => {
    const result = extractObsUris("obs://vault/10-projects/sub/note");
    expect(result).toHaveLength(1);
    expect(result[0].vaultName).toBe("vault");
    expect(result[0].path).toBe("10-projects/sub/note");
  });

  it("deduplicates by normalized components, not raw string", () => {
    const result = extractObsUris("obs://drafts/my%20note and obs://drafts/my%20note#Section");
    expect(result).toHaveLength(2);
  });

  it("ignores URIs inside code fences with language tag", () => {
    const result = extractObsUris("```markdown\nobs://drafts/fake\n```");
    expect(result).toHaveLength(0);
  });
});
