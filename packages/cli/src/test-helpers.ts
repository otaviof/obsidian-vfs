import type { DiscoveredSkill, LocalIndexTracker, VFSResult } from "@obsidian-vfs/core";
import { vi } from "vitest";

/** Default CLI option values shared across all command test factories. */
export const CLI_DEFAULTS = {
  json: false,
  verbose: false,
  cliPath: "obsidian",
  timeoutMs: 10_000,
} as const;

/** Stub implementation for the `formatError` mock shared by all command tests. */
export const FORMAT_ERROR_STUB = (err: { message: string }) => `ERROR: ${err.message}`;

/** Stub implementation for `formatVerboseTiming` shared by all command tests. */
export const FORMAT_VERBOSE_TIMING_STUB = (label: string, ms: number) =>
  `[verbose] ${label}: ${ms.toFixed(1)}ms`;

/** Default vault context used by tracker factories. */
const DEFAULT_TRACKER_CONTEXT = { physicalPath: "/Users/me/vault", name: "My Vault" };

/**
 * Build a mock `LocalIndexTracker` whose single method resolves to the given result.
 *
 * Each command uses a different tracker method (`resolveMention`, `resolveWikilink`,
 * `listSkills`, etc.), so the caller specifies the method name and the value it should
 * resolve to. Extra method stubs can be supplied via `extraMethods`.
 */
export function makeLocalIndexTrackerWith<K extends keyof LocalIndexTracker>(
  methodName: K,
  result: VFSResult<unknown>,
  extraMethods: Partial<Record<keyof LocalIndexTracker, ReturnType<typeof vi.fn>>> = {},
): { tracker: LocalIndexTracker; mock: ReturnType<typeof vi.fn> } {
  const mock = vi.fn().mockResolvedValue(result);
  const tracker = {
    context: DEFAULT_TRACKER_CONTEXT,
    [methodName]: mock,
    ...extraMethods,
  } as unknown as LocalIndexTracker;
  return { tracker, mock };
}

/** Build a `DiscoveredSkill` with sensible defaults, overridable per-field. */
export function makeDiscoveredSkill(overrides: Partial<DiscoveredSkill> = {}): DiscoveredSkill {
  return {
    name: "deploy",
    description: "Deploy helper",
    vaultRelativePath: "skills/deploy/SKILL.md",
    ...overrides,
  };
}

/** Build a mock tracker whose `listSkills` resolves to the given result. */
export function makeListSkillsTracker(listSkillsResult: VFSResult<DiscoveredSkill[]>) {
  const { tracker } = makeLocalIndexTrackerWith("listSkills", listSkillsResult);
  return tracker;
}