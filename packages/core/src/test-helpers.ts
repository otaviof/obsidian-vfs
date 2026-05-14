import type { Mock } from "vitest";
import { vi } from "vitest";

import type { ObsidianCLI } from "./cli.js";
import type { LocalIndexTracker } from "./local-index-tracker.js";
import type { DiscoveredResource, VFSResult } from "./types.js";

/** Wrap a mocked `node:fs/promises` function with a type-safe cast to avoid verbose inline casts. */
export function mockFsFunction<T>(fn: T): Mock<(...args: unknown[]) => Promise<unknown>> {
  return vi.mocked(fn as unknown as (...args: unknown[]) => Promise<unknown>);
}

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
    open: vi.fn(),
    dailyPath: vi.fn(),
    tags: vi.fn(),
    propertyRead: vi.fn(),
    ...overrides,
  };
}

/** Default vault context used by tracker factories. */
const DEFAULT_TRACKER_CONTEXT = {
  physicalPath: "/Users/me/vault",
  name: "My Vault",
  vfsConfig: {
    allowed: [] as readonly string[],
    blocked: [] as readonly string[],
    skills: [] as string[],
    agents: [] as string[],
  },
  mode: "full" as const,
};

/** Build a mock `LocalIndexTracker` whose single method resolves to the given result. */
export function makeLocalIndexTrackerWith<K extends keyof LocalIndexTracker>(
  methodName: K,
  result: VFSResult<unknown>,
  extraMethods: Partial<Record<keyof LocalIndexTracker, ReturnType<typeof vi.fn>>> = {},
  contextOverrides: Partial<typeof DEFAULT_TRACKER_CONTEXT> = {},
): { tracker: LocalIndexTracker; mock: ReturnType<typeof vi.fn> } {
  const mock = vi.fn().mockResolvedValue(result);
  const tracker = {
    context: { ...DEFAULT_TRACKER_CONTEXT, ...contextOverrides },
    [methodName]: mock,
    ...extraMethods,
  } as unknown as LocalIndexTracker;
  return { tracker, mock };
}

/** Build a `DiscoveredResource` with sensible defaults, overridable per-field. */
export function makeDiscoveredResource(
  overrides: Partial<DiscoveredResource> = {},
): DiscoveredResource {
  return {
    name: "deploy",
    description: "Deploy helper",
    vaultRelativePath: "skills/deploy/SKILL.md",
    ...overrides,
  };
}
