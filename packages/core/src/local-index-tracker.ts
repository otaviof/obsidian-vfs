import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";

import type { ObsidianCLI } from "./cli.js";
import type {
  Disposable,
  MentionResult,
  VaultContext,
  VFSConfig,
  VFSFileStat,
  VFSFileType,
  VFSResult,
} from "./types.js";
import type { PathSecurityOptions } from "./path-security.js";
import type { FileChangeListener } from "./file-watcher.js";
import { LRUCache } from "./lru-cache.js";
import { validateVFSConfig } from "./vfs-config.js";
import { canonicalizePath } from "./path-security.js";
import { readVirtualFile } from "./read-file.js";
import { resolveWikilink as resolveWikilinkFn } from "./resolve-wikilink.js";
import { resolveResource } from "./resolve-resource.js";
import { resolveMention as resolveMentionFn } from "./resolve-mention.js";
import { readDirectory as readDirectoryFn, statVirtualFile } from "./fs-enumeration.js";
import { VaultFileWatcher } from "./file-watcher.js";

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
 * validation, path security, LRU-cached file reads, wikilink resolution,
 * mention parsing, file watching, and directory enumeration. Instantiate via
 * the async `create` factory, the constructor is private to prevent
 * partially-initialized instances.
 */
export class LocalIndexTracker {
  /** Immutable vault state produced during initialization. */
  readonly context: VaultContext;

  /** @internal LRU file-content cache. Used by internal modules for invalidation. */
  readonly cache: LRUCache<string, string>;

  /** @internal CLI instance. Used by internal resolution modules. */
  readonly cli: ObsidianCLI;

  readonly #securityOptions: PathSecurityOptions;
  #watcher: VaultFileWatcher | null;

  private constructor(context: VaultContext, cache: LRUCache<string, string>, cli: ObsidianCLI) {
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
    this.cli = cli;
    this.#securityOptions = {
      vaultRoot: context.physicalPath,
      allowedFolders: frozenConfig.allowedFolders,
    };
    this.#watcher = null;
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

    return { ok: true, value: new LocalIndexTracker(context, cache, cli) };
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

  /** Resolve a bare wikilink name to a vault-relative path. */
  async resolveWikilink(name: string): Promise<VFSResult<string>> {
    return resolveWikilinkFn(name, {
      cli: this.cli,
      cache: this.cache,
      vaultRoot: this.context.physicalPath,
      allowedFolders: this.context.vfsConfig.allowedFolders,
      mode: this.context.mode,
    });
  }

  /** Resolve an agent by name from configured agentsDirs. */
  async resolveAgent(name: string): Promise<VFSResult<string>> {
    return resolveResource(name, this.context.vfsConfig.agentsDirs, this.#securityOptions);
  }

  /** Resolve a skill by name from configured skillsDirs. */
  async resolveSkill(name: string): Promise<VFSResult<string>> {
    return resolveResource(name, this.context.vfsConfig.skillsDirs, this.#securityOptions);
  }

  /** Parse and resolve an `@obs:` mention to a full MentionResult. */
  async resolveMention(mention: string): Promise<VFSResult<MentionResult>> {
    return resolveMentionFn(mention, this);
  }

  /** List directory contents with security enforcement. */
  async readDirectory(virtualPath: string): Promise<VFSResult<readonly [string, VFSFileType][]>> {
    return readDirectoryFn(virtualPath, this.#securityOptions);
  }

  /** Get file or directory metadata. */
  async stat(virtualPath: string): Promise<VFSResult<VFSFileStat>> {
    return statVirtualFile(virtualPath, this.#securityOptions);
  }

  /** Start watching the vault for file changes. Returns a Disposable to stop. */
  startWatching(debounceMs?: number): Disposable {
    if (!this.#watcher) {
      this.#watcher = new VaultFileWatcher(this.context.physicalPath, this.cache, debounceMs);
      this.#watcher.start();
    }
    return { dispose: () => this.stopWatching() };
  }

  /** Stop watching the vault for file changes. */
  stopWatching(): void {
    this.#watcher?.stop();
    this.#watcher = null;
  }

  /** Register a listener for file change events. Starts watcher if not active. */
  onDidChangeFile(listener: FileChangeListener): Disposable {
    if (!this.#watcher) {
      this.startWatching();
    }
    // Safe: startWatching() always assigns #watcher before returning
    return this.#watcher!.onDidChange(listener);
  }
}
