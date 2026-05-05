import { describe, expect, it, vi } from "vitest";

vi.mock("@obsidian-vfs/core", () => {
  return {
    ObsidianCLIImpl: vi.fn(),
    LocalIndexTracker: {
      create: vi.fn(),
    },
    bootstrapTracker: vi.fn(),
  };
});

import { bootstrapTracker } from "@obsidian-vfs/core";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { bootstrapTracker as reExported } from "./bootstrap.js";

describe("bootstrap re-export", () => {
  it("re-exports bootstrapTracker from core", () => {
    expect(reExported).toBe(bootstrapTracker);
  });

  it("delegates to core bootstrapTracker", async () => {
    const fakeTracker = { context: { name: "Vault" } } as unknown as LocalIndexTracker;
    vi.mocked(bootstrapTracker).mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    const result = await reExported({ cliPath: "obsidian", timeoutMs: 10_000 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracker).toBe(fakeTracker);
      expect(result.value.initMs).toBe(42);
    }
  });
});
