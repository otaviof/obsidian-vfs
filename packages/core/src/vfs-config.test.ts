import { describe, expect, it } from "vitest";

import { validateVFSConfig } from "./vfs-config.js";

describe("validateVFSConfig", () => {
  it("validates a full valid config", () => {
    const result = validateVFSConfig({
      agentsDirs: ["agents"],
      skillsDirs: ["skills"],
      allowedFolders: ["notes"],
    });
    expect(result).toEqual({
      ok: true,
      value: { agentsDirs: ["agents"], skillsDirs: ["skills"], allowedFolders: ["notes"] },
    });
  });

  it("returns defaults for null input", () => {
    const result = validateVFSConfig(null);
    expect(result).toEqual({
      ok: true,
      value: { agentsDirs: [], skillsDirs: [], allowedFolders: [] },
    });
  });

  it("returns defaults for undefined input", () => {
    const result = validateVFSConfig(undefined);
    expect(result).toEqual({
      ok: true,
      value: { agentsDirs: [], skillsDirs: [], allowedFolders: [] },
    });
  });

  it("rejects non-object input", () => {
    const result = validateVFSConfig("string");
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "VFSConfig must be a non-null object" },
    });
  });

  it("defaults missing agentsDirs to empty array", () => {
    const result = validateVFSConfig({ skillsDirs: [], allowedFolders: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentsDirs).toEqual([]);
    }
  });

  it("defaults all missing fields to empty arrays", () => {
    const result = validateVFSConfig({});
    expect(result).toEqual({
      ok: true,
      value: { agentsDirs: [], skillsDirs: [], allowedFolders: [] },
    });
  });

  it("rejects agentsDirs with wrong type", () => {
    const result = validateVFSConfig({ agentsDirs: "not-array" });
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "agentsDirs must be string[]" },
    });
  });

  it("rejects agentsDirs containing non-strings", () => {
    const result = validateVFSConfig({ agentsDirs: [1, 2] });
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "agentsDirs must be string[]" },
    });
  });

  it("ignores extra fields", () => {
    const result = validateVFSConfig({ agentsDirs: [], extra: true });
    expect(result.ok).toBe(true);
  });

  it("rejects skillsDirs with wrong type", () => {
    const result = validateVFSConfig({ skillsDirs: 42 });
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "skillsDirs must be string[]" },
    });
  });

  it("rejects allowedFolders with wrong type", () => {
    const result = validateVFSConfig({ allowedFolders: true });
    expect(result).toEqual({
      ok: false,
      error: { code: "PARSE_ERROR", message: "allowedFolders must be string[]" },
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
      agentsDirs: [],
      skillsDirs: [],
      allowedFolders: [],
    });
    expect(result.ok).toBe(true);
  });
});
