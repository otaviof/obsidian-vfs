import { describe, expect, it } from "vitest";

import { extractMentions } from "./mention-extractor.js";

describe("extractMentions", () => {
  it("extracts a single mention", () => {
    const result = extractMentions("Check @obs:architect for guidance");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("architect");
    expect(result[0].kind).toBe("context");
  });

  it("extracts multiple mentions in order", () => {
    const result = extractMentions("Use @obs:architect and @obs:plan.md");
    expect(result).toHaveLength(2);
    expect(result[0].reference).toBe("architect");
    expect(result[1].reference).toBe("plan.md");
  });

  it("extracts section targeting", () => {
    const result = extractMentions("See @obs:plan.md#Architecture");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("plan.md#Architecture");
  });

  it("extracts paths with slashes", () => {
    const result = extractMentions("Read @obs:10-projects/plan.md");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("10-projects/plan.md");
  });

  it("returns empty array for no mentions", () => {
    const result = extractMentions("Just a normal prompt");
    expect(result).toHaveLength(0);
  });

  it("ignores mentions in fenced code blocks", () => {
    const result = extractMentions("```\n@obs:agent\n```");
    expect(result).toHaveLength(0);
  });

  it("ignores mentions in inline code", () => {
    const result = extractMentions("Use `@obs:agent` syntax");
    expect(result).toHaveLength(0);
  });

  it("extracts mention after code block", () => {
    const result = extractMentions("```\ncode\n``` then @obs:real");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("real");
  });

  it("deduplicates repeated mentions", () => {
    const result = extractMentions("@obs:note and @obs:note again");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("note");
  });

  it("extracts mention at start of prompt", () => {
    const result = extractMentions("@obs:architect explain this");
    expect(result).toHaveLength(1);
    expect(result[0].startIndex).toBe(0);
  });

  it("extracts mention at end of prompt", () => {
    const result = extractMentions("explain @obs:architect");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("architect");
  });

  it("strips trailing comma", () => {
    const result = extractMentions("Check @obs:note, then proceed");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("note");
  });

  it("strips trailing period", () => {
    const result = extractMentions("See @obs:note.");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("note");
  });

  it("strips trailing paren", () => {
    const result = extractMentions("(see @obs:note)");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("note");
  });

  it("handles mixed code and real mentions", () => {
    const result = extractMentions("`@obs:fake` but @obs:real");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("real");
  });

  it("handles multiple code blocks with mention between", () => {
    const result = extractMentions("```\na\n```\n@obs:x\n```\nb\n```");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("x");
  });

  it("returns empty for @obs: followed by space", () => {
    const result = extractMentions("@obs: has space");
    expect(result).toHaveLength(0);
  });

  it("ignores @obs: followed only by punctuation", () => {
    expect(extractMentions("@obs:,")).toHaveLength(0);
  });

  it("ignores mentions in code fences with language tag", () => {
    const result = extractMentions("```typescript\n@obs:fake\n```");
    expect(result).toHaveLength(0);
  });

  it("computes correct endIndex after trailing punctuation stripping", () => {
    const result = extractMentions("Check @obs:note, done");
    expect(result).toHaveLength(1);
    expect(result[0].raw).toBe("@obs:note");
    expect(result[0].startIndex).toBe(6);
    expect(result[0].endIndex).toBe(15);
  });

  it("extracts /obs: mention as skill kind", () => {
    const result = extractMentions("Use /obs:obsidian for this");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("skill");
    expect(result[0].raw).toBe("/obs:obsidian");
    expect(result[0].reference).toBe("obsidian");
  });

  it("extracts both @obs: and /obs: in same prompt", () => {
    const result = extractMentions("Check @obs:architect and /obs:obsidian");
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("context");
    expect(result[0].reference).toBe("architect");
    expect(result[1].kind).toBe("skill");
    expect(result[1].reference).toBe("obsidian");
  });

  it("does not dedup @obs:X and /obs:X with same name", () => {
    const result = extractMentions("@obs:obsidian and /obs:obsidian");
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("context");
    expect(result[1].kind).toBe("skill");
  });

  it("ignores /obs: in fenced code blocks", () => {
    const result = extractMentions("```\n/obs:obsidian\n```");
    expect(result).toHaveLength(0);
  });

  it("ignores /obs: in inline code", () => {
    const result = extractMentions("Use `/obs:obsidian` syntax");
    expect(result).toHaveLength(0);
  });

  it("strips trailing punctuation from /obs: mention", () => {
    const result = extractMentions("See /obs:obsidian, then proceed");
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("obsidian");
  });

  it("extracts /obs: with section targeting", () => {
    const result = extractMentions("Load /obs:obsidian#Usage");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("skill");
    expect(result[0].reference).toBe("obsidian#Usage");
  });

  it("deduplicates repeated /obs: mentions", () => {
    const result = extractMentions("/obs:obsidian and /obs:obsidian again");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("skill");
  });
});
