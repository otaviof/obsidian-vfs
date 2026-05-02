import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";

import type { ObsidianCLI } from "./cli.js";
import type { VaultContext, VFSConfig, VFSResult } from "./types.js";
import type { PathSecurityOptions } from "./path-security.js";
import { LRUCache } from "./lru-cache.js";
import { validateVFSConfig } from "./vfs-config.js";
import { canonicalizePath } from "./path-security.js";
import { readVirtualFile } from "./read-file.js";

/**
 * Optional configuration for the `LocalIndexTracker.create` factory.
 */
export interface LocalIndexTrackerOptions {
  readonly cacheMaxSize?: number;
}

const DEFAULT_CACHE_MAX_SIZE = 500;
const CONFIG_FILENAME = "obsidian-vfs.json";
const CONFIG_DIR = ".obsidian";

/**
 * Central orchestrator atop `ObsidianCLI`. Provides vault discovery, config
 * validation, path security, LRU-cached file reads, and (in P3b) wikilink
 * resolution. Instantiate via the async `create` factory, the constructor is
 * private to prevent partially-initialized instances.
 */
export class LocalIndexTracker {
  /** Immutable vault state produced during initialization. */
  readonly context: VaultContext;

  /** LRU file-content cache. Exposed for P3b's watcher to call `delete`. */
  readonly cache: LRUCache<string, string>;

  readonly #securityOptions: PathSecurityOptions;

  private constructor(context: VaultContext, cache: LRUCache<string, string>) {
    const frozenConfig = Object.freeze({
      agentsDirs: Object.freeze([...context.vfsConfig.agentsDirs]),
      skillsDirs: Object.freeze([...context.vfsConfig.skillsDirs]),
      allowedFolders: Object.freeze([...context.vfsConfig.allowedFolders]),
    });
    this.context = Object.freeze({
      ...context,
      vfsConfig: frozenConfig as VFSConfig,
    });
    this.cache = cache;
    this.#securityOptions = {
      vaultRoot: context.physicalPath,
      allowedFolders: frozenConfig.allowedFolders,
    };
  }

  /**
   * Async factory. Discovers the vault, validates config, determines mode,
   * and returns a ready-to-use tracker. Returns an error result instead of
   * throwing when preconditions fail.
   */
  static async create(
    cli: ObsidianCLI,
    options?: LocalIndexTrackerOptions,
  ): Promise<VFSResult<LocalIndexTracker>> {
    const pathResult = await cli.vaultPath();
    if (!pathResult.ok) {
      return {
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: pathResult.error.message },
      };
    }
    const physicalPath = pathResult.value;

    const nameResult = await cli.vaultName();
    if (!nameResult.ok) {
      return {
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: nameResult.error.message },
      };
    }
    const name = nameResult.value;

    let vfsConfig: VFSConfig;
    const configPath = path.join(physicalPath, CONFIG_DIR, CONFIG_FILENAME);

    try {
      const raw = await fsReadFile(configPath, "utf-8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {
          ok: false,
          error: { code: "PARSE_ERROR", message: "Invalid JSON in obsidian-vfs.json" },
        };
      }
      const configResult = validateVFSConfig(parsed);
      if (!configResult.ok) return configResult;
      vfsConfig = configResult.value;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        vfsConfig = { agentsDirs: [], skillsDirs: [], allowedFolders: [] };
      } else {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: `Cannot read config file: ${(err as Error).message}`,
          },
        };
      }
    }

    const available = await cli.isAvailable();
    const mode = available ? "full" : "degraded";

    const context: VaultContext = { name, physicalPath, vfsConfig, mode };
    const maxSize = options?.cacheMaxSize ?? DEFAULT_CACHE_MAX_SIZE;
    const cache = new LRUCache<string, string>(maxSize);

    return { ok: true, value: new LocalIndexTracker(context, cache) };
  }

  /**
   * Read a file from the vault with security validation and LRU caching.
   * Caches by canonicalized path so equivalent paths share a single entry.
   * Errors are never cached.
   */
  async readFile(virtualPath: string): Promise<VFSResult<string>> {
    const canonical = canonicalizePath(virtualPath, this.context.physicalPath);
    if (!canonical.ok) return canonical;

    const cached = this.cache.get(canonical.value);
    if (cached !== undefined) {
      return { ok: true, value: cached };
    }

    const result = await readVirtualFile(virtualPath, this.#securityOptions);
    if (!result.ok) return result;

    const decoded = new TextDecoder().decode(result.value);
    this.cache.set(canonical.value, decoded);
    return { ok: true, value: decoded };
  }
}
