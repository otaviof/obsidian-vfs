import type { DiscoveredResource, LocalIndexTracker, VFSResult } from "@obsidian-vfs/core";
import type { Mock } from "vitest";
import { makeLocalIndexTrackerWith } from "@obsidian-vfs/core/testing";

export { makeLocalIndexTrackerWith, makeDiscoveredResource } from "@obsidian-vfs/core/testing";

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

/** Build a mock tracker whose `listSkills` resolves to the given result. */
export function makeListSkillsTracker(listSkillsResult: VFSResult<DiscoveredResource[]>) {
  const { tracker } = makeLocalIndexTrackerWith("listSkills", listSkillsResult);
  return tracker;
}

/** Build a mock tracker whose `listAgents` resolves to the given result. */
export function makeListAgentsTracker(
  listAgentsResult: VFSResult<DiscoveredResource[]>,
  extraMethods: Partial<Record<keyof LocalIndexTracker, Mock>> = {},
) {
  const { tracker } = makeLocalIndexTrackerWith("listAgents", listAgentsResult, extraMethods);
  return tracker;
}
