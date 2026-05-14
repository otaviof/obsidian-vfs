import { describe, expect, it } from "vitest";

import { validateVFSConfig } from "./vfs-config.js";

describe("validateVFSConfig", () => {
  it("validates a full valid config", () => {
    const result = validateVFSConfig({
      agents: ["agents"],
      skills: ["skills"],
      allowed: ["notes"],
      blocked: [],
    });
    expect(result).toEqual({
      ok: true,
      value: { agents: ["agents"], skills: ["skills"], allowed: ["notes"], blocked: [] },
    });
  });

  it("returns defaults for null input", () => {
    const result = validateVFSConfig(null);
    expect(result).toEqual({
      ok: true,
      value: { agents: [], skills: [], allowed: [], blocked: [] },
    });
  });

  it("returns defaults for undefined input", () => {
    const result = validateVFSConfig(undefined);
    expect(result).toEqual({
      ok: true,
      value: { agents: [], skills: [], allowed: [], blocked: [] },
    });
  });

  it("rejects non-object input", () => {
    const result = validateVFSConfig("string");
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "VFSConfig must be a non-null object" },
    });
  });

  it("defaults missing agents to empty array", () => {
    const result = validateVFSConfig({ skills: [], allowed: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agents).toEqual([]);
    }
  });

  it("defaults all missing fields to empty arrays", () => {
    const result = validateVFSConfig({});
    expect(result).toEqual({
      ok: true,
      value: { agents: [], skills: [], allowed: [], blocked: [] },
    });
  });

  it("rejects agents with wrong type", () => {
    const result = validateVFSConfig({ agents: "not-array" });
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "agents must be string[]" },
    });
  });

  it("rejects agents containing non-strings", () => {
    const result = validateVFSConfig({ agents: [1, 2] });
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "agents must be string[]" },
    });
  });

  it("ignores extra fields", () => {
    const result = validateVFSConfig({ agents: [], extra: true });
    expect(result.ok).toBe(true);
  });

  it("rejects skills with wrong type", () => {
    const result = validateVFSConfig({ skills: 42 });
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "skills must be string[]" },
    });
  });

  it("rejects allowed with wrong type", () => {
    const result = validateVFSConfig({ allowed: true });
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "allowed must be string[]" },
    });
  });

  it("rejects blocked with wrong type", () => {
    const result = validateVFSConfig({ blocked: 99 });
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "blocked must be string[]" },
    });
  });

  it("rejects array input", () => {
    const result = validateVFSConfig(["a"]);
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "VFSConfig must be a non-null object" },
    });
  });

  it("accepts all empty arrays", () => {
    const result = validateVFSConfig({
      agents: [],
      skills: [],
      allowed: [],
      blocked: [],
    });
    expect(result.ok).toBe(true);
  });

  it("accepts blocked as child of allowed (carving exception)", () => {
    const result = validateVFSConfig({
      allowed: ["notes"],
      blocked: ["notes/draft"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.blocked).toEqual(["notes/draft"]);
    }
  });

  it("rejects exact match in allowed and blocked", () => {
    const result = validateVFSConfig({
      allowed: ["notes"],
      blocked: ["notes"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PARSE_ERROR");
      expect(result.error.message).toContain("appears in both");
    }
  });

  it("rejects blocked parent of allowed entry", () => {
    const result = validateVFSConfig({
      allowed: ["notes/draft"],
      blocked: ["notes"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PARSE_ERROR");
      expect(result.error.message).toContain("parent of allowed");
    }
  });

  it("accepts blocked without allowed", () => {
    const result = validateVFSConfig({
      blocked: ["private"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.blocked).toEqual(["private"]);
      expect(result.value.allowed).toEqual([]);
    }
  });

  it("strips trailing slashes from all fields", () => {
    const result = validateVFSConfig({
      agents: ["agents/"],
      skills: ["skills///"],
      allowed: ["notes/"],
      blocked: ["notes/draft/"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agents).toEqual(["agents"]);
      expect(result.value.skills).toEqual(["skills"]);
      expect(result.value.allowed).toEqual(["notes"]);
      expect(result.value.blocked).toEqual(["notes/draft"]);
    }
  });

  it("detects conflict when trailing slashes differ", () => {
    const result = validateVFSConfig({
      allowed: ["notes/"],
      blocked: ["notes"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PARSE_ERROR");
      expect(result.error.message).toContain("appears in both");
    }
  });

  it("detects parent conflict with trailing slashes", () => {
    const result = validateVFSConfig({
      allowed: ["notes/draft/"],
      blocked: ["notes/"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PARSE_ERROR");
      expect(result.error.message).toContain("parent of allowed");
    }
  });

  it("normalizes dot-segment paths", () => {
    const result = validateVFSConfig({
      allowed: ["./notes"],
      blocked: ["notes/./draft"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowed).toEqual(["notes"]);
      expect(result.value.blocked).toEqual(["notes/draft"]);
    }
  });

  it("detects conflict after dot-segment normalization", () => {
    const result = validateVFSConfig({
      allowed: ["./notes"],
      blocked: ["notes"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PARSE_ERROR");
      expect(result.error.message).toContain("appears in both");
    }
  });
});
