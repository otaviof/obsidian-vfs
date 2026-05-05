import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  Uri: {
    from: vi.fn((components: { scheme: string; authority: string; path: string }) => ({
      scheme: components.scheme,
      authority: components.authority,
      path: components.path,
    })),
  },
}));

import { toVaultPath, toVscodeUri } from "./uri-adapter.js";

describe("toVaultPath", () => {
  it("strips leading slash from uri path", () => {
    expect(toVaultPath({ path: "/10-projects/plan.md" } as never)).toBe("10-projects/plan.md");
  });

  it("returns empty string for root path", () => {
    expect(toVaultPath({ path: "/" } as never)).toBe("");
  });

  it("handles path without leading slash", () => {
    expect(toVaultPath({ path: "note.md" } as never)).toBe("note.md");
  });
});

describe("toVscodeUri", () => {
  it("builds obs:// URI from vault path and name", () => {
    const uri = toVscodeUri("10-projects/plan.md", "MyVault");
    expect(uri).toEqual({
      scheme: "obs",
      authority: "MyVault",
      path: "/10-projects/plan.md",
    });
  });

  it("handles root path", () => {
    const uri = toVscodeUri("", "Vault");
    expect(uri).toEqual({
      scheme: "obs",
      authority: "Vault",
      path: "/",
    });
  });
});
