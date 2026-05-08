import { describe, expect, it } from "vitest";

import {
  CLAUDE_HAIKU,
  CLAUDE_OPUS,
  CLAUDE_SONNET,
  DEFAULT_MODEL,
  mapModelToClaude,
} from "./model-mapping.js";

describe("mapModelToClaude", () => {
  describe("Claude pass-through (returns original unchanged)", () => {
    it.each([
      ["claude-3-haiku-20240307"],
      ["claude-3.5-haiku"],
      ["claude-3-sonnet-20240229"],
      ["claude-3.5-sonnet"],
      ["claude-sonnet-4-6"],
      ["claude-3-opus-20240229"],
      ["claude-opus-4-6"],
      ["haiku"],
      ["sonnet"],
      ["opus"],
    ])("%s → unchanged", (input) => {
      expect(mapModelToClaude(input)).toBe(input);
    });
  });

  describe("Claude pass-through preserves original casing", () => {
    it("preserves mixed case", () => {
      expect(mapModelToClaude("Claude-3.5-Sonnet")).toBe("Claude-3.5-Sonnet");
    });
  });

  describe("Gemini family", () => {
    it.each([
      ["gemini-3.1-flash-preview", CLAUDE_SONNET],
      ["gemini-3-flash-preview", CLAUDE_SONNET],
      ["gemini-2.0-flash-exp", CLAUDE_SONNET],
      ["gemini-3.1-flash-lite-preview", CLAUDE_HAIKU],
      ["gemini-2.0-flash-lite", CLAUDE_HAIKU],
      ["gemini-1.5-pro-latest", CLAUDE_SONNET],
      ["gemini-2.0-pro", CLAUDE_SONNET],
      ["gemini-1.0-ultra", CLAUDE_OPUS],
    ])("%s → %s", (input, expected) => {
      expect(mapModelToClaude(input)).toBe(expected);
    });
  });

  describe("GPT family", () => {
    it.each([
      ["gpt-3.5-turbo", CLAUDE_HAIKU],
      ["gpt-3.5-turbo-0125", CLAUDE_HAIKU],
      ["gpt-4o-mini", CLAUDE_HAIKU],
      ["gpt-4o", CLAUDE_SONNET],
      ["gpt-4-turbo", CLAUDE_SONNET],
      ["gpt-4.5-preview", CLAUDE_OPUS],
    ])("%s → %s", (input, expected) => {
      expect(mapModelToClaude(input)).toBe(expected);
    });
  });

  describe("o-series", () => {
    it.each([
      ["o1", CLAUDE_OPUS],
      ["o1-preview", CLAUDE_OPUS],
      ["o1-mini", CLAUDE_OPUS],
      ["o3", CLAUDE_OPUS],
      ["o3-mini", CLAUDE_OPUS],
    ])("%s → %s", (input, expected) => {
      expect(mapModelToClaude(input)).toBe(expected);
    });
  });

  describe("unknown models", () => {
    it("defaults to sonnet for unknown model", () => {
      expect(mapModelToClaude("llama-3-70b")).toBe(DEFAULT_MODEL);
    });

    it("defaults to sonnet for empty string", () => {
      expect(mapModelToClaude("")).toBe(DEFAULT_MODEL);
    });
  });

  describe("case insensitivity", () => {
    it("handles uppercase non-Claude input", () => {
      expect(mapModelToClaude("GPT-4O-MINI")).toBe(CLAUDE_HAIKU);
    });
  });
});
