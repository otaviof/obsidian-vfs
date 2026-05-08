import { describe, expect, it, vi } from "vitest";

vi.mock("@obsidian-vfs/core", () => ({
  bootstrapTracker: vi.fn(),
  resolveCliPath: vi.fn(() => "/mock/obsidian"),
  resolveExecConfig: vi.fn(() => ({ cliPath: "/mock/obsidian", timeoutMs: 10_000 })),
}));

import {
  bootstrapTracker as coreBootstrapTracker,
  resolveCliPath,
  resolveExecConfig,
} from "@obsidian-vfs/core";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import { bootstrapTracker } from "./bootstrap.js";

describe("bootstrapTracker", () => {
  it("delegates to core with environment-resolved config", async () => {
    const fakeTracker = { context: { name: "Vault" } } as unknown as LocalIndexTracker;
    vi.mocked(coreBootstrapTracker).mockResolvedValueOnce({
      ok: true,
      value: { tracker: fakeTracker, initMs: 42 },
    });

    const result = await bootstrapTracker();

    expect(resolveExecConfig).toHaveBeenCalledWith(process.env);
    expect(resolveCliPath).toHaveBeenCalled();
    expect(coreBootstrapTracker).toHaveBeenCalledWith({
      cliPath: "/mock/obsidian",
      timeoutMs: 10_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracker).toBe(fakeTracker);
      expect(result.value.initMs).toBe(42);
    }
  });
});
