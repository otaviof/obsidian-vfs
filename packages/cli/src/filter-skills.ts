import type { DiscoveredSkill } from "@obsidian-vfs/core";

/** Options for skill filtering. */
interface FilterOptions {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

/** Result of filtering a skill list. */
interface FilterResult {
  readonly matched: readonly DiscoveredSkill[];
  readonly skipped: readonly string[];
}

/** Convert a glob pattern (supports `*` and `?`) to an anchored RegExp. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withWildcards = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${withWildcards}$`);
}

/** Filter a list of discovered skills by include/exclude glob patterns. */
export function filterSkills(
  skills: readonly DiscoveredSkill[],
  options: FilterOptions,
): FilterResult {
  if (options.include.length === 0 && options.exclude.length === 0) {
    return { matched: skills, skipped: [] };
  }

  if (options.include.length > 0) {
    const patterns = options.include.map(globToRegExp);
    const matched: DiscoveredSkill[] = [];
    const skipped: string[] = [];
    for (const skill of skills) {
      if (patterns.some((re) => re.test(skill.name))) {
        matched.push(skill);
      } else {
        skipped.push(skill.name);
      }
    }
    return { matched, skipped };
  }

  const patterns = options.exclude.map(globToRegExp);
  const matched: DiscoveredSkill[] = [];
  const skipped: string[] = [];
  for (const skill of skills) {
    if (patterns.some((re) => re.test(skill.name))) {
      skipped.push(skill.name);
    } else {
      matched.push(skill);
    }
  }
  return { matched, skipped };
}