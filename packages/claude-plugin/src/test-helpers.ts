import type { LocalIndexTracker } from "@obsidian-vfs/core";

export function fakeLocalIndexTracker(
  overrides: Partial<{ name: string; physicalPath: string }> = {},
): LocalIndexTracker {
  return {
    context: {
      name: overrides.name ?? "Vault",
      physicalPath: overrides.physicalPath ?? "/vault",
    },
  } as unknown as LocalIndexTracker;
}
