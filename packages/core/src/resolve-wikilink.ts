import path from "node:path";

import type { ObsidianCLI } from "./cli.js";
import { listMarkdownFiles } from "./fs-enumeration.js";
import type { LRUCache } from "./lru-cache.js";
import { isAllowedPath, type PathSecurityOptions } from "./path-security.js";
import type { VFSResult, WikilinkResolution } from "./types.js";

/**
 * Bundled dependencies for wikilink resolution.
 */
export interface ResolveWikilinkOptions {
  readonly cli: ObsidianCLI;
  readonly cache: LRUCache<string, string>;
  readonly vaultRoot: string;
  readonly allowed: readonly string[];
  readonly blocked: readonly string[];
  readonly mode: "full" | "degraded";
}

/** Build a PathSecurityOptions from the wikilink options. */
function securityOptions(options: ResolveWikilinkOptions): PathSecurityOptions {
  return { vaultRoot: options.vaultRoot, allowed: options.allowed, blocked: options.blocked };
}

async function globFallback(
  normalizedName: string,
  options: ResolveWikilinkOptions,
): Promise<string | undefined> {
  const target = normalizedName.toLowerCase();
  const result = await listMarkdownFiles(securityOptions(options));
  if (!result.ok) return undefined;

  for (const filePath of result.value) {
    if (path.basename(filePath, ".md").toLowerCase() === target) {
      return filePath;
    }
  }

  return undefined;
}

/** Cache key prefix to namespace wikilink entries from file content entries. */
const CACHE_PREFIX = "wikilink::";

/** Pick the best match from search results using Obsidian's basename-exact-match rule. */
function pickExactMatch(candidates: readonly string[], normalizedName: string): string | undefined {
  const target = normalizedName.toLowerCase();
  const exact = candidates.filter((f) => path.basename(f, ".md").toLowerCase() === target);
  if (exact.length === 0) return undefined;
  if (exact.length === 1) return exact[0];
  return exact.reduce((a, b) => (a.length <= b.length ? a : b));
}

/**
 * Resolve a bare wikilink name to a vault-relative path with search candidates.
 */
export async function resolveWikilink(
  name: string,
  options: ResolveWikilinkOptions,
): Promise<VFSResult<WikilinkResolution>> {
  const normalizedName = name.trim().replace(/\.md$/i, "");
  if (normalizedName === "") {
    return {
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "No file matches wikilink: (empty)" },
    };
  }

  if (normalizedName.includes("/")) {
    if (normalizedName.includes("..")) {
      return {
        ok: false,
        error: {
          code: "PERMISSION_DENIED",
          message: `Path traversal in wikilink: ${normalizedName}`,
        },
      };
    }
    const directPath = normalizedName + ".md";
    if (!isAllowedPath(directPath, securityOptions(options))) {
      return {
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "Path not within allowed folders" },
      };
    }
    return { ok: true, value: { resolvedPath: directPath, candidates: [] } };
  }

  const cacheKey = CACHE_PREFIX + normalizedName.toLowerCase();
  const cached = options.cache.get(cacheKey);
  if (cached !== undefined) {
    return { ok: true, value: { resolvedPath: cached, candidates: [] } };
  }

  if (options.mode === "full") {
    const searchResult = await options.cli.search(`file:${normalizedName}`);
    if (searchResult.ok) {
      const candidates = searchResult.value;
      const match = pickExactMatch(candidates, normalizedName);
      if (match !== undefined) {
        options.cache.set(cacheKey, match);
        return { ok: true, value: { resolvedPath: match, candidates } };
      }
    }
  }

  const globResult = await globFallback(normalizedName, options);
  if (globResult !== undefined) {
    options.cache.set(cacheKey, globResult);
    return { ok: true, value: { resolvedPath: globResult, candidates: [] } };
  }

  return {
    ok: false,
    error: { code: "FILE_NOT_FOUND", message: `No file matches wikilink: ${normalizedName}` },
  };
}
