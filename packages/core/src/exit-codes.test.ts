import { describe, expect, it } from "vitest";

import { EXIT_ERROR, EXIT_SUCCESS, EXIT_USAGE } from "./exit-codes.js";

describe("exit codes", () => {
  it("exports expected values", () => {
    expect(EXIT_SUCCESS).toBe(0);
    expect(EXIT_ERROR).toBe(1);
    expect(EXIT_USAGE).toBe(2);
  });
});
