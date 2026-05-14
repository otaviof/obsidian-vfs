import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";

import type { ObsidianCLI } from "./cli.js";
import type {
  DiscoveredResource,
  Disposable,
  MentionResult,
  VaultContext,
  VFSConfig,
  VFSFileStat,
  VFSFileType,
  VFSResult,
  WikilinkResolution,
} from "./types.js";
import type { PathSecurityOptions } from "./path-security.js";
import type { FileChangeListener } from "./file-watcher.js";
import { LRUCache } from "./lru-cache.js";
import { validateVFSConfig } from "./vfs-config.js";
import { canonicalizePath } from "./path-security.js";
import { readVirtualFile } from "./read-file.js";
import { resolveWikilink as resolveWikilinkFn } from "./resolve-wikilink.js";
import { resolveResource, resolveSkillResource } from "./resolve-resource.js";
import { resolveMention as resolveMentionFn } from "./resolve-mention.js";
import {
  listMarkdownFiles,
  readDirectory as readDirectoryFn,
  statVirtualFile,
} from "./fs-enumeration.js";
import { VaultFileWatcher } from "./file-watcher.js";
import { extractFrontmatterDescription } from "./frontmatter.js";

/**
 * Optional configuration for the `LocalIndexTracker.create` factory.
 */
export interface LocalIndexTrackerOptions {
  readonly cacheMaxSize?: number;
}

const DEFAULT_CACHE_MAX_SIZE = 500;
const CONFIG_FILENAME = "obsidian-vfs.json";
const CONFIG_DIR = ".obsidian";
const SKILL_FILENAME = "SKILL.md";

/** Allowed characters in resource names (alphanumeric, hyphens, underscores, dots). */
const SAFE_RESOURCE_NAME_RE = /^[a-zA-Z0-9._-]+$/;

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
      agents: Object.freeze([...context.vfsConfig.agents]),
      skills: Object.freeze([...context.vfsConfig.skills]),
      allowed: Object.freeze([...context.vfsConfig.allowed]),
      blocked: Object.freeze([...context.vfsConfig.blocked]),
    });
    this.context = Object.freeze({
      ...context,
      vfsConfig: frozenConfig as VFSConfig,
    });
    this.cache = cache;
    this.cli = cli;
    this.#securityOptions = {
      vaultRoot: context.physicalPath,
      allowed: frozenConfig.allowed,
      blocked: frozenConfig.blocked,
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
        vfsConfig = { agents: [], skills: [], allowed: [], blocked: [] };
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

  /** Resolve a bare wikilink name to a vault-relative path with search candidates. */
  async resolveWikilink(name: string): Promise<VFSResult<WikilinkResolution>> {
    return resolveWikilinkFn(name, {
      cli: this.cli,
      cache: this.cache,
      vaultRoot: this.context.physicalPath,
      allowed: this.context.vfsConfig.allowed,
      blocked: this.context.vfsConfig.blocked,
      mode: this.context.mode,
    });
  }

  /** Resolve an agent by name from configured agents directories. */
  async resolveAgent(name: string): Promise<VFSResult<string>> {
    return resolveResource(name, this.context.vfsConfig.agents, this.#securityOptions);
  }

  /** Resolve a skill by name as a directory containing SKILL.md. */
  async resolveSkill(name: string): Promise<VFSResult<string>> {
    return resolveSkillResource(name, this.context.vfsConfig.skills, this.#securityOptions);
  }

  /** Parse and resolve an `@obs:` mention to a full MentionResult. */
  async resolveMention(mention: string): Promise<VFSResult<MentionResult>> {
    return resolveMentionFn(mention, this);
  }

  /** List directory contents with security enforcement. */
  async readDirectory(virtualPath: string): Promise<VFSResult<readonly [string, VFSFileType][]>> {
    return readDirectoryFn(virtualPath, this.#securityOptions);
  }

  /** Recursively enumerate all markdown files in the vault. */
  async listFiles(): Promise<VFSResult<string[]>> {
    return listMarkdownFiles(this.#securityOptions);
  }

  /** Get file or directory metadata. */
  async stat(virtualPath: string): Promise<VFSResult<VFSFileStat>> {
    return statVirtualFile(virtualPath, this.#securityOptions);
  }

  /** Enumerate all skills from configured skills directories with deduplication. */
  async listSkills(): Promise<VFSResult<DiscoveredResource[]>> {
    const { skills } = this.context.vfsConfig;
    const seen = new Set<string>();
    const result: DiscoveredResource[] = [];

    for (const dir of skills) {
      const entries = await this.readDirectory(dir);
      if (!entries.ok) continue;

      for (const [name, type] of entries.value) {
        if (type !== "directory" || seen.has(name) || !SAFE_RESOURCE_NAME_RE.test(name)) continue;
        seen.add(name);

        const skillPath = path.join(dir, name, SKILL_FILENAME);
        const content = await this.readFile(skillPath);
        if (!content.ok) continue;

        const description =
          extractFrontmatterDescription(content.value) ?? `Obsidian vault skill: ${name}`;

        result.push({ name, description, vaultRelativePath: skillPath });
      }
    }

    return { ok: true, value: result };
  }

  /** Enumerate all agents from configured agents directories with deduplication. */
  async listAgents(): Promise<VFSResult<DiscoveredResource[]>> {
    const { agents } = this.context.vfsConfig;
    const seen = new Set<string>();
    const result: DiscoveredResource[] = [];

    for (const dir of agents) {
      const entries = await this.readDirectory(dir);
      if (!entries.ok) continue;

      for (const [fileName, type] of entries.value) {
        if (type !== "file" || !fileName.endsWith(".md")) continue;
        const name = fileName.slice(0, -3);
        if (seen.has(name) || !SAFE_RESOURCE_NAME_RE.test(name)) continue;
        seen.add(name);

        const agentPath = path.join(dir, fileName);
        const content = await this.readFile(agentPath);
        if (!content.ok) continue;

        const description =
          extractFrontmatterDescription(content.value) ?? `Obsidian vault agent: ${name}`;

        result.push({ name, description, vaultRelativePath: agentPath });
      }
    }

    return { ok: true, value: result };
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
    return this.#watcher!.onDidChange(listener);
  }
}
