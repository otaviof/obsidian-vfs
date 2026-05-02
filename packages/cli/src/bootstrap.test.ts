import { describe, expect, it, vi } from "vitest";

vi.mock("@obsidian-vfs/core", () => {
  return {
    ObsidianCLIImpl: vi.fn(),
    LocalIndexTracker: {
      create: vi.fn(),
    },
  };
});

import { LocalIndexTracker, ObsidianCLIImpl } from "@obsidian-vfs/core";

import { bootstrapTracker } from "./bootstrap.js";

// eslint-disable-next-line @typescript-eslint/unbound-method
const mockCreate = vi.mocked(LocalIndexTracker.create);

describe("bootstrapTracker", () => {
  const options = { cliPath: "obsidian", timeoutMs: 10_000 };

  it("returns tracker and initMs on success", async () => {
    const fakeTracker = { context: { name: "Vault" } } as unknown as LocalIndexTracker;
    mockCreate.mockResolvedValueOnce({ ok: true, value: fakeTracker });

    const result = await bootstrapTracker(options);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracker).toBe(fakeTracker);
      expect(result.value.initMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("passes cli options to ObsidianCLIImpl", async () => {
    const fakeTracker = {} as unknown as LocalIndexTracker;
    mockCreate.mockResolvedValueOnce({ ok: true, value: fakeTracker });

    await bootstrapTracker({ cliPath: "/usr/bin/obsidian", timeoutMs: 5000 });

    expect(ObsidianCLIImpl).toHaveBeenCalledWith({
      cliPath: "/usr/bin/obsidian",
      timeoutMs: 5000,
    });
  });

  it("propagates CLI_UNAVAILABLE error", async () => {
    mockCreate.mockResolvedValueOnce({
      ok: false,
      error: { code: "CLI_UNAVAILABLE", message: "not found" },
    });

    const result = await bootstrapTracker(options);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CLI_UNAVAILABLE");
    }
  });

  it("propagates VAULT_NOT_FOUND error", async () => {
    mockCreate.mockResolvedValueOnce({
      ok: false,
      error: { code: "VAULT_NOT_FOUND", message: "no vault" },
    });

    const result = await bootstrapTracker(options);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_NOT_FOUND");
    }
  });

  it("propagates PARSE_ERROR", async () => {
    mockCreate.mockResolvedValueOnce({
      ok: false,
      error: { code: "PARSE_ERROR", message: "bad config" },
    });

    const result = await bootstrapTracker(options);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PARSE_ERROR");
    }
  });

  it("measures initMs as a positive number", async () => {
    const fakeTracker = {} as unknown as LocalIndexTracker;
    mockCreate.mockResolvedValueOnce({ ok: true, value: fakeTracker });

    const result = await bootstrapTracker(options);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.initMs).toBe("number");
      expect(result.value.initMs).toBeGreaterThanOrEqual(0);
    }
  });
});
