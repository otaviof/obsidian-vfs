import { describe, expect, it } from "vitest";

import { toAbsolutePath } from "./types.js";
import { fakeLocalIndexTracker } from "./test-helpers.js";

describe("toAbsolutePath", () => {
  it("joins physicalPath with relative path", () => {
    const tracker = fakeLocalIndexTracker({ physicalPath: "/vault" });
    expect(toAbsolutePath(tracker, "notes/file.md")).toBe("/vault/notes/file.md");
  });

  it("handles root-level files", () => {
    const tracker = fakeLocalIndexTracker({ physicalPath: "/my/vault" });
    expect(toAbsolutePath(tracker, "README.md")).toBe("/my/vault/README.md");
  });
});
