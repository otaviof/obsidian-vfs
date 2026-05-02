import { vi } from "vitest";

import type { ObsidianCLI } from "./cli.js";

/**
 * Create a fully-stubbed ObsidianCLI mock with optional per-method overrides.
 */
export function mockCLI(overrides: Partial<ObsidianCLI> = {}): ObsidianCLI {
  return {
    vaultPath: vi.fn().mockResolvedValue({ ok: true, value: "/vault" }),
    vaultName: vi.fn().mockResolvedValue({ ok: true, value: "TestVault" }),
    isAvailable: vi.fn().mockResolvedValue(true),
    search: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    searchContext: vi.fn(),
    files: vi.fn(),
    folders: vi.fn(),
    backlinks: vi.fn(),
    links: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    move: vi.fn(),
    delete: vi.fn(),
    append: vi.fn(),
    prepend: vi.fn(),
    open: vi.fn(),
    dailyPath: vi.fn(),
    tags: vi.fn(),
    propertyRead: vi.fn(),
    ...overrides,
  };
}
