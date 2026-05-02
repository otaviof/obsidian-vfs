import { readdir } from "node:fs/promises";
import path from "node:path";

import type { ObsidianCLI } from "./cli.js";
import type { LRUCache } from "./lru-cache.js";
import type { VFSResult } from "./types.js";

/**
 * Bundled dependencies for wikilink resolution.
 */
export interface ResolveWikilinkOptions {
  readonly cli: ObsidianCLI;
  readonly cache: LRUCache<string, string>;
  readonly vaultRoot: string;
  readonly allowedFolders: readonly string[];
  readonly mode: "full" | "degraded";
}

async function globFallback(
  normalizedName: string,
  options: ResolveWikilinkOptions,
): Promise<string | undefined> {
  const target = normalizedName.toLowerCase();
  const searchDirs =
    options.allowedFolders.length > 0
      ? options.allowedFolders.map((f) => path.resolve(options.vaultRoot, f))
      : [options.vaultRoot];

  for (const dir of searchDirs) {
    let entries: string[];
    try {
      entries = await readdir(dir, { recursive: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".md")) continue;
      const basename = path.basename(entry, ".md").toLowerCase();
      if (basename === target) {
        const relative = path.relative(options.vaultRoot, path.join(dir, entry));
        return relative;
      }
    }
  }

  return undefined;
}

/** Cache key prefix to namespace wikilink entries from file content entries. */
const CACHE_PREFIX = "wikilink::";

/**
 * Resolve a bare wikilink name to a vault-relative path.
 */
export async function resolveWikilink(
  name: string,
  options: ResolveWikilinkOptions,
): Promise<VFSResult<string>> {
  const normalizedName = name.trim().replace(/\.md$/i, "");
  if (normalizedName === "") {
    return {
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "No file matches wikilink: (empty)" },
    };
  }

  const cacheKey = CACHE_PREFIX + normalizedName.toLowerCase();
  const cached = options.cache.get(cacheKey);
  if (cached !== undefined) {
    return { ok: true, value: cached };
  }

  if (options.mode === "full") {
    const searchResult = await options.cli.search(`file:"${normalizedName}"`, { limit: 1 });
    if (!searchResult.ok) return searchResult;
    if (searchResult.value.length > 0) {
      const resolved = searchResult.value[0];
      options.cache.set(cacheKey, resolved);
      return { ok: true, value: resolved };
    }
  }

  const globResult = await globFallback(normalizedName, options);
  if (globResult !== undefined) {
    options.cache.set(cacheKey, globResult);
    return { ok: true, value: globResult };
  }

  return {
    ok: false,
    error: { code: "FILE_NOT_FOUND", message: `No file matches wikilink: ${normalizedName}` },
  };
}
