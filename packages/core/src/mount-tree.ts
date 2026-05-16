/**
 * Mount tree node.
 * - `null` = fully mounted (all descendants visible)
 * - `ReadonlyMap` = partially mounted (only listed children are visible)
 */
export type MountNode = ReadonlyMap<string, MountNode | null>;

/**
 * Build a mount tree from autoMount paths.
 *
 * @example
 * buildMountTree(["30-resources"])
 * // → Map { "30-resources" => null }
 *
 * buildMountTree(["20-areas/idea"])
 * // → Map { "20-areas" => Map { "idea" => null } }
 *
 * buildMountTree(["20-areas/idea", "20-areas/work"])
 * // → Map { "20-areas" => Map { "idea" => null, "work" => null } }
 *
 * buildMountTree(["20-areas", "20-areas/idea"])
 * // → Map { "20-areas" => null }  (full mount subsumes sub-path)
 */
export function buildMountTree(autoMount: readonly string[]): MountNode {
  const root = new Map<string, MountNode | null>();
  for (const mountPath of autoMount) {
    const segments = mountPath.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    insertPath(root, segments, 0);
  }
  return root;
}

function insertPath(node: Map<string, MountNode | null>, segments: string[], depth: number): void {
  const seg = segments[depth];
  const isLast = depth === segments.length - 1;

  if (isLast) {
    node.set(seg, null);
    return;
  }

  const existing = node.get(seg);
  if (existing === null) return;

  const child = existing ?? new Map<string, MountNode | null>();
  node.set(seg, child);
  // Safe: child is the mutable Map we created/retrieved; public API returns ReadonlyMap
  insertPath(child as Map<string, MountNode | null>, segments, depth + 1);
}
