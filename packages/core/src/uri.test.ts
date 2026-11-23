import { describe, expect, it } from "vitest";

import { buildObsUri, matchUriPrefix, parseObsUri, URI_SCHEMES } from "./uri.js";

describe("parseObsUri", () => {
  it("parses a valid URI without section", () => {
    const result = parseObsUri("obs://vault/note.md");
    expect(result).toEqual({
      ok: true,
      value: { vaultName: "vault", path: "note.md", section: undefined, scheme: "obs" },
    });
  });

  it("parses a valid URI with section", () => {
    const result = parseObsUri("obs://vault/note.md#Heading");
    expect(result).toEqual({
      ok: true,
      value: { vaultName: "vault", path: "note.md", section: "Heading", scheme: "obs" },
    });
  });

  it("parses nested path", () => {
    const result = parseObsUri("obs://vault/folder/sub/note.md");
    expect(result).toEqual({
      ok: true,
      value: {
        vaultName: "vault",
        path: "folder/sub/note.md",
        section: undefined,
        scheme: "obs",
      },
    });
  });

  it("decodes URL-encoded vault name", () => {
    const result = parseObsUri("obs://My%20Vault/note.md");
    expect(result).toEqual({
      ok: true,
      value: { vaultName: "My Vault", path: "note.md", section: undefined, scheme: "obs" },
    });
  });

  it("decodes URL-encoded path", () => {
    const result = parseObsUri("obs://vault/my%20note.md");
    expect(result).toEqual({
      ok: true,
      value: { vaultName: "vault", path: "my note.md", section: undefined, scheme: "obs" },
    });
  });

  it("ignores trailing # with empty section", () => {
    const result = parseObsUri("obs://vault/note.md#");
    expect(result).toEqual({
      ok: true,
      value: { vaultName: "vault", path: "note.md", section: undefined, scheme: "obs" },
    });
  });

  it("parses section with spaces", () => {
    const result = parseObsUri("obs://vault/note.md#My Section");
    expect(result).toEqual({
      ok: true,
      value: { vaultName: "vault", path: "note.md", section: "My Section", scheme: "obs" },
    });
  });

  it("handles case-insensitive scheme", () => {
    const result = parseObsUri("OBS://vault/note.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.vaultName).toBe("vault");
      expect(result.value.scheme).toBe("obs");
    }
  });

  it("parses vault:// alias URI", () => {
    const result = parseObsUri("vault://v/p");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.vaultName).toBe("v");
      expect(result.value.path).toBe("p");
      expect(result.value.scheme).toBe("vault");
    }
  });

  it("parses VAULT:// alias URI case-insensitively with normalized scheme", () => {
    const result = parseObsUri("VAULT://v/p");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.vaultName).toBe("v");
      expect(result.value.path).toBe("p");
      expect(result.value.scheme).toBe("vault");
    }
  });

  it("rejects vault:/ (single slash) as wrong scheme", () => {
    const result = parseObsUri("vault:/v/p");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_URI");
      expect(result.error.message).toContain("obs");
      expect(result.error.message).toContain("vault");
    }
  });

  it("rejects missing scheme", () => {
    const result = parseObsUri("vault/note.md");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_URI");
      expect(result.error.message).toContain("obs");
      expect(result.error.message).toContain("vault");
    }
  });

  it("rejects wrong scheme", () => {
    const result = parseObsUri("file://vault/note.md");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_URI");
      expect(result.error.message).toContain("obs");
      expect(result.error.message).toContain("vault");
    }
  });

  it("rejects empty vault name", () => {
    const result = parseObsUri("obs:///note.md");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_URI");
    }
  });

  it("rejects missing path", () => {
    const result = parseObsUri("obs://vault");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_URI");
    }
  });

  it("rejects empty path", () => {
    const result = parseObsUri("obs://vault/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_URI");
    }
  });

  it("rejects malformed percent-encoding", () => {
    const result = parseObsUri("obs://vault/note%GG.md");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_URI");
    }
  });
});

describe("buildObsUri", () => {
  it("round-trips a parsed URI", () => {
    const uri = "obs://vault/folder/note.md";
    const parsed = parseObsUri(uri);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(buildObsUri(parsed.value)).toBe(uri);
    }
  });

  it("builds URI without section", () => {
    const uri = buildObsUri({ vaultName: "vault", path: "note.md", section: undefined });
    expect(uri).toBe("obs://vault/note.md");
  });

  it("builds URI with section", () => {
    const uri = buildObsUri({ vaultName: "vault", path: "note.md", section: "Heading" });
    expect(uri).toBe("obs://vault/note.md#Heading");
  });

  it("encodes vault name with spaces", () => {
    const uri = buildObsUri({ vaultName: "My Vault", path: "note.md", section: undefined });
    expect(uri).toBe("obs://My%20Vault/note.md");
  });

  it("encodes path with spaces", () => {
    const uri = buildObsUri({ vaultName: "vault", path: "my note.md", section: undefined });
    expect(uri).toBe("obs://vault/my%20note.md");
  });

  it("round-trips URI with encoded vault and section", () => {
    const uri = "obs://My%20Vault/folder/note.md#My%20Section";
    const parsed = parseObsUri(uri);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(buildObsUri(parsed.value)).toBe(uri);
    }
  });

  it("defaults to obs:// scheme (regression pin)", () => {
    const uri = buildObsUri({ vaultName: "v", path: "p", section: undefined });
    expect(uri).toBe("obs://v/p");
  });

  it("builds vault:// when scheme: vault", () => {
    const uri = buildObsUri({ vaultName: "v", path: "p", section: undefined, scheme: "vault" });
    expect(uri).toBe("vault://v/p");
  });

  it("round-trips VAULT:// input to vault:// preserving scheme value", () => {
    const parsed = parseObsUri("VAULT://v/p");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.scheme).toBe("vault");
      const rebuilt = buildObsUri(parsed.value);
      expect(rebuilt).toBe("vault://v/p");
      const reparsed = parseObsUri(rebuilt);
      expect(reparsed.ok).toBe(true);
      if (reparsed.ok) {
        expect(reparsed.value.scheme).toBe(parsed.value.scheme);
      }
    }
  });
});

describe("matchUriPrefix", () => {
  it.each([
    ["obs://v/p", "obs"],
    ["OBS://v/p", "obs"],
    ["vault://v/p", "vault"],
    ["VAULT://v/p", "vault"],
    ["Vault://v/p", "vault"],
    ["vault:/v/p", undefined],
    ["file://v/p", undefined],
    ["", undefined],
  ])("matchUriPrefix(%j) === %j", (input, expected) => {
    expect(matchUriPrefix(input)).toBe(expected);
  });

  it("covers exactly the accepted schemes", () => {
    expect(URI_SCHEMES).toEqual(["obs", "vault"]);
  });
});
