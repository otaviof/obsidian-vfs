/** Options for resource filtering. */
interface FilterOptions {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

/** Result of filtering a resource list. */
interface FilterResult<T> {
  readonly matched: readonly T[];
  readonly skipped: readonly string[];
}

/** Convert a glob pattern (supports `*` and `?`) to an anchored RegExp. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withWildcards = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${withWildcards}$`);
}

/** Filter a list of named resources by include/exclude glob patterns. */
export function filterSkills<T extends { readonly name: string }>(
  items: readonly T[],
  options: FilterOptions,
): FilterResult<T> {
  if (options.include.length === 0 && options.exclude.length === 0) {
    return { matched: items, skipped: [] };
  }

  if (options.include.length > 0) {
    const patterns = options.include.map(globToRegExp);
    const matched: T[] = [];
    const skipped: string[] = [];
    for (const item of items) {
      if (patterns.some((re) => re.test(item.name))) {
        matched.push(item);
      } else {
        skipped.push(item.name);
      }
    }
    return { matched, skipped };
  }

  const patterns = options.exclude.map(globToRegExp);
  const matched: T[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    if (patterns.some((re) => re.test(item.name))) {
      skipped.push(item.name);
    } else {
      matched.push(item);
    }
  }
  return { matched, skipped };
}
