import type { DiscoveredResource, LocalIndexTracker, VFSResult } from "@obsidian-vfs/core";
import type { Mock } from "vitest";
import { vi } from "vitest";
import { makeLocalIndexTrackerWith } from "@obsidian-vfs/core/testing";

export { makeLocalIndexTrackerWith, makeDiscoveredResource } from "@obsidian-vfs/core/testing";

/** Default CLI option values shared across all command test factories. */
export const CLI_DEFAULTS = {
  json: false,
  verbose: false,
  description: false,
  cliPath: "obsidian",
  timeoutMs: 10_000,
} as const;

/** Stub implementation for the `formatError` mock shared by all command tests. */
export const FORMAT_ERROR_STUB = (err: { message: string }) => `ERROR: ${err.message}`;

/** Stub implementation for `formatVerboseTiming` shared by all command tests. */
export const FORMAT_VERBOSE_TIMING_STUB = (label: string, ms: number) =>
  `[verbose] ${label}: ${ms.toFixed(1)}ms`;

/** Options for building a provision tracker mock. */
export interface ProvisionTrackerOptions {
  readonly readFileResult?: VFSResult<string>;
  readonly extraMethods?: Partial<Record<keyof LocalIndexTracker, Mock>>;
}

/** Build a provision tracker whose list method and `readFile` are both mocked. */
function makeProvisionTracker<K extends keyof LocalIndexTracker>(
  methodName: K,
  listResult: VFSResult<DiscoveredResource[]>,
  options: ProvisionTrackerOptions = {},
) {
  const readFileResult = options.readFileResult ?? {
    ok: false as const,
    error: { code: "FILE_NOT_FOUND", message: "no source" },
  };
  const readFileMock = vi.fn().mockResolvedValue(readFileResult);
  const { tracker } = makeLocalIndexTrackerWith(methodName, listResult, {
    readFile: readFileMock,
    ...options.extraMethods,
  });
  return tracker;
}

/** Build a mock tracker whose `listSkills` and `readFile` resolve to the given results. */
export function makeListSkillsTracker(
  listSkillsResult: VFSResult<DiscoveredResource[]>,
  options?: ProvisionTrackerOptions,
) {
  return makeProvisionTracker("listSkills", listSkillsResult, options);
}

/** Build a mock tracker whose `listAgents` and `readFile` resolve to the given results. */
export function makeListAgentsTracker(
  listAgentsResult: VFSResult<DiscoveredResource[]>,
  options?: ProvisionTrackerOptions,
) {
  return makeProvisionTracker("listAgents", listAgentsResult, options);
}
