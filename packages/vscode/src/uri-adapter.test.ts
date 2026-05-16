import { describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-helpers.js";

vi.mock("vscode", () => createVscodeMock({ uri: true }));

import { toFileUri, toVaultPath, toVaultPathFromFile, toVscodeUri } from "./uri-adapter.js";

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
    expect(uri).toMatchObject({
      scheme: "obs",
      authority: "MyVault",
      path: "/10-projects/plan.md",
    });
  });

  it("handles root path", () => {
    const uri = toVscodeUri("", "Vault");
    expect(uri).toMatchObject({
      scheme: "obs",
      authority: "Vault",
      path: "/",
    });
  });
});

describe("toFileUri", () => {
  it("builds file:// URI from vault path and physical path", () => {
    const uri = toFileUri("10-projects/plan.md", "/vault");
    expect(uri).toMatchObject({ scheme: "file", fsPath: "/vault/10-projects/plan.md" });
  });

  it("handles root-level file", () => {
    const uri = toFileUri("note.md", "/vault");
    expect(uri).toMatchObject({ scheme: "file", fsPath: "/vault/note.md" });
  });

  it("handles empty vault path", () => {
    const uri = toFileUri("", "/vault");
    expect(uri).toMatchObject({ scheme: "file", fsPath: "/vault" });
  });

  it("handles deeply nested path", () => {
    const uri = toFileUri("a/b/c/d.md", "/home/user/vault");
    expect(uri).toMatchObject({ scheme: "file", fsPath: "/home/user/vault/a/b/c/d.md" });
  });
});

describe("toVaultPathFromFile", () => {
  it("extracts vault-relative path from file URI", () => {
    const uri = { fsPath: "/vault/notes/todo.md" } as never;
    expect(toVaultPathFromFile(uri, "/vault")).toBe("notes/todo.md");
  });

  it("returns file name for root-level file", () => {
    const uri = { fsPath: "/vault/note.md" } as never;
    expect(toVaultPathFromFile(uri, "/vault")).toBe("note.md");
  });

  it("returns empty string when URI matches vault root", () => {
    const uri = { fsPath: "/vault" } as never;
    expect(toVaultPathFromFile(uri, "/vault")).toBe("");
  });
});
