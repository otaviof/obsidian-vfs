import { describe, expect, it, vi } from "vitest";

import { LocalIndexTracker } from "./local-index-tracker.js";
import { ObsidianCLIImpl } from "./obsidian-cli.js";
import { bootstrapTracker } from "./bootstrap.js";

vi.mock("./obsidian-cli.js", () => ({ ObsidianCLIImpl: vi.fn() }));
vi.mock("./local-index-tracker.js", () => ({
  LocalIndexTracker: { create: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/unbound-method
const mockCreate = vi.mocked(LocalIndexTracker.create);

describe("bootstrapTracker", () => {
  const config = { cliPath: "obsidian", timeoutMs: 10_000 };

  it("returns tracker and initMs on success", async () => {
    const fakeTracker = { context: { name: "Vault" } } as unknown as LocalIndexTracker;
    mockCreate.mockResolvedValueOnce({ ok: true, value: fakeTracker });

    const result = await bootstrapTracker(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracker).toBe(fakeTracker);
      expect(result.value.initMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("passes config to ObsidianCLIImpl", async () => {
    const fakeTracker = {} as unknown as LocalIndexTracker;
    mockCreate.mockResolvedValueOnce({ ok: true, value: fakeTracker });

    await bootstrapTracker({ cliPath: "/usr/bin/obsidian", timeoutMs: 5000 });

    expect(ObsidianCLIImpl).toHaveBeenCalledWith({
      cliPath: "/usr/bin/obsidian",
      timeoutMs: 5000,
    });
  });

  it("propagates errors from LocalIndexTracker.create", async () => {
    mockCreate.mockResolvedValueOnce({
      ok: false,
      error: { code: "CLI_UNAVAILABLE", message: "not found" },
    });

    const result = await bootstrapTracker(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CLI_UNAVAILABLE");
    }
  });
});
