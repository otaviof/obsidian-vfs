#!/usr/bin/env node

// ../core/dist/exec.js
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

// ../core/dist/resolve-cli-path.js
var OBSIDIAN_VFS_CLI_PATH = "OBSIDIAN_VFS_CLI_PATH";
var PLATFORM_OBSIDIAN_VFS_CLI_PATHS = {
  darwin: "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli",
  linux: "/usr/local/bin/obsidian"
};
function resolveCliPath(options) {
  const userPath = options?.userPath;
  if (userPath !== void 0 && userPath !== "")
    return userPath;
  const env = options?.env ?? process.env;
  const envValue = env[OBSIDIAN_VFS_CLI_PATH];
  if (envValue !== void 0 && envValue !== "")
    return envValue;
  const platform = options?.platform ?? process.platform;
  return PLATFORM_OBSIDIAN_VFS_CLI_PATHS[platform] ?? "obsidian";
}

// ../core/dist/exec.js
var execFile = promisify(execFileCb);
var DEFAULT_TIMEOUT_MS = 1e4;
function resolveExecConfig(env) {
  const cliPath = resolveCliPath({ env });
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const rawTimeout = env.OBSIDIAN_VFS_TIMEOUT_MS;
  if (rawTimeout !== void 0) {
    const parsed = Number.parseInt(rawTimeout, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      timeoutMs = parsed;
    }
  }
  return Object.freeze({ cliPath, timeoutMs });
}
async function execCLI(args, options) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), options.timeoutMs);
  try {
    const { stdout, stderr } = await execFile(options.cliPath, [...args], {
      signal: ac.signal
    });
    return { ok: true, value: { stdout, stderr } };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: { code: "TIMEOUT", message: `CLI timed out after ${options.timeoutMs}ms` }
      };
    }
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return {
        ok: false,
        error: {
          code: "CLI_UNAVAILABLE",
          message: `CLI binary not found: ${options.cliPath}`
        }
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: "CLI_ERROR", message } };
  } finally {
    clearTimeout(timer);
  }
}

// ../core/dist/local-index-tracker.js
import { readFile as fsReadFile } from "node:fs/promises";
import path7 from "node:path";

// ../core/dist/lru-cache.js
var LRUCache = class {
  #maxSize;
  #map;
  constructor(maxSize) {
    if (maxSize < 1)
      throw new RangeError("maxSize must be >= 1");
    this.#maxSize = maxSize;
    this.#map = /* @__PURE__ */ new Map();
  }
  /** Return the value for `key`, moving it to most-recent position. */
  get(key) {
    if (!this.#map.has(key))
      return void 0;
    const value = this.#map.get(key);
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }
  /** Insert or update `key`. Evicts the oldest entry when at capacity. */
  set(key, value) {
    this.#map.delete(key);
    if (this.#map.size >= this.#maxSize) {
      const oldest = this.#map.keys().next().value;
      this.#map.delete(oldest);
    }
    this.#map.set(key, value);
  }
  /** Check whether `key` exists without affecting recency. */
  has(key) {
    return this.#map.has(key);
  }
  /** Remove `key` from the cache. Returns `true` if the key existed. */
  delete(key) {
    return this.#map.delete(key);
  }
  /** Remove all entries. */
  clear() {
    this.#map.clear();
  }
  /** Current number of entries in the cache. */
  get size() {
    return this.#map.size;
  }
};

// ../core/dist/vfs-config.js
var DEFAULT_VFS_CONFIG = {
  agentsDirs: [],
  skillsDirs: [],
  allowedFolders: []
};
function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
function validateVFSConfig(raw) {
  if (raw == null) {
    return { ok: true, value: { ...DEFAULT_VFS_CONFIG } };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "VFSConfig must be a non-null object" }
    };
  }
  const obj = raw;
  const fields = ["agentsDirs", "skillsDirs", "allowedFolders"];
  for (const field of fields) {
    if (field in obj && !isStringArray(obj[field])) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: `${field} must be string[]` }
      };
    }
  }
  return {
    ok: true,
    value: {
      agentsDirs: obj.agentsDirs ?? [],
      skillsDirs: obj.skillsDirs ?? [],
      allowedFolders: obj.allowedFolders ?? []
    }
  };
}

// ../core/dist/path-security.js
import { realpath } from "node:fs/promises";
import path from "node:path";
function canonicalizePath(virtualPath, vaultRoot) {
  const resolved = path.resolve(vaultRoot, virtualPath);
  if (resolved !== vaultRoot && !resolved.startsWith(vaultRoot + path.sep)) {
    return {
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Path resolves outside vault root" }
    };
  }
  return { ok: true, value: resolved };
}
function checkAllowedFolder(absolutePath, options) {
  if (options.allowedFolders.length === 0) {
    return { ok: true, value: absolutePath };
  }
  for (const folder of options.allowedFolders) {
    const allowed = path.resolve(options.vaultRoot, folder);
    if (absolutePath === allowed || absolutePath.startsWith(allowed + path.sep)) {
      return { ok: true, value: absolutePath };
    }
    if (allowed.startsWith(absolutePath + path.sep)) {
      return { ok: true, value: absolutePath };
    }
  }
  return {
    ok: false,
    error: { code: "PERMISSION_DENIED", message: "Path not within allowed folders" }
  };
}
async function checkSymlink(absolutePath, vaultRoot) {
  try {
    const real = await realpath(absolutePath);
    if (real !== vaultRoot && !real.startsWith(vaultRoot + path.sep)) {
      return {
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "Symlink resolves outside vault root" }
      };
    }
    return { ok: true, value: real };
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `File does not exist: ${absolutePath}` }
      };
    }
    return {
      ok: false,
      error: { code: "PERMISSION_DENIED", message: `Cannot resolve path: ${absolutePath}` }
    };
  }
}
async function validatePath(virtualPath, options) {
  const canonical = canonicalizePath(virtualPath, options.vaultRoot);
  if (!canonical.ok)
    return canonical;
  const allowed = checkAllowedFolder(canonical.value, options);
  if (!allowed.ok)
    return allowed;
  return checkSymlink(canonical.value, options.vaultRoot);
}

// ../core/dist/read-file.js
import { readFile } from "node:fs/promises";
async function readVirtualFile(virtualPath, options) {
  const pathResult = await validatePath(virtualPath, options);
  if (!pathResult.ok)
    return pathResult;
  try {
    const buffer = await readFile(pathResult.value);
    return { ok: true, value: buffer };
  } catch (err) {
    const errno = err;
    if (errno.code === "ENOENT") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `File does not exist: ${pathResult.value}` }
      };
    }
    if (errno.code === "EACCES") {
      return {
        ok: false,
        error: { code: "PERMISSION_DENIED", message: `Permission denied: ${pathResult.value}` }
      };
    }
    return {
      ok: false,
      error: { code: "CLI_ERROR", message: err.message }
    };
  }
}

// ../core/dist/resolve-wikilink.js
import path3 from "node:path";

// ../core/dist/fs-enumeration.js
import { readdir, stat } from "node:fs/promises";
import path2 from "node:path";
async function readDirectory(virtualPath, options) {
  const canonical = canonicalizePath(virtualPath, options.vaultRoot);
  if (!canonical.ok)
    return canonical;
  let entries;
  try {
    entries = await readdir(canonical.value, { withFileTypes: true });
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `Directory does not exist: ${virtualPath}` }
      };
    }
    if (code === "ENOTDIR") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `Not a directory: ${virtualPath}` }
      };
    }
    return {
      ok: false,
      error: { code: "CLI_ERROR", message: err.message }
    };
  }
  const tuples = [];
  for (const entry of entries) {
    if (entry.name.startsWith("."))
      continue;
    const childAbsolute = path2.join(canonical.value, entry.name);
    const childAllowed = checkAllowedFolder(childAbsolute, options);
    if (!childAllowed.ok)
      continue;
    tuples.push([entry.name, entry.isDirectory() ? "directory" : "file"]);
  }
  tuples.sort((a, b) => a[0].localeCompare(b[0]));
  return { ok: true, value: tuples };
}
function hasDotSegment(relativePath) {
  return relativePath.split(path2.sep).some((seg) => seg.startsWith("."));
}
async function listMarkdownFiles(options) {
  const searchDirs = options.allowedFolders.length > 0 ? options.allowedFolders.map((f) => path2.resolve(options.vaultRoot, f)) : [options.vaultRoot];
  const files = [];
  for (const dir of searchDirs) {
    let entries;
    try {
      entries = await readdir(dir, { recursive: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".md"))
        continue;
      if (hasDotSegment(entry))
        continue;
      files.push(path2.relative(options.vaultRoot, path2.join(dir, entry)));
    }
  }
  files.sort();
  return { ok: true, value: files };
}
async function statVirtualFile(virtualPath, options) {
  const pathResult = await validatePath(virtualPath, options);
  if (!pathResult.ok)
    return pathResult;
  try {
    const stats = await stat(pathResult.value);
    return {
      ok: true,
      value: {
        type: stats.isDirectory() ? "directory" : "file",
        mtime: stats.mtimeMs,
        ctime: stats.ctimeMs,
        size: stats.size
      }
    };
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        ok: false,
        error: { code: "FILE_NOT_FOUND", message: `File does not exist: ${virtualPath}` }
      };
    }
    return {
      ok: false,
      error: { code: "CLI_ERROR", message: err.message }
    };
  }
}

// ../core/dist/resolve-wikilink.js
async function globFallback(normalizedName, options) {
  const target = normalizedName.toLowerCase();
  const result = await listMarkdownFiles({
    vaultRoot: options.vaultRoot,
    allowedFolders: options.allowedFolders
  });
  if (!result.ok)
    return void 0;
  for (const filePath of result.value) {
    if (path3.basename(filePath, ".md").toLowerCase() === target) {
      return filePath;
    }
  }
  return void 0;
}
var CACHE_PREFIX = "wikilink::";
function pickExactMatch(candidates, normalizedName) {
  const target = normalizedName.toLowerCase();
  const exact = candidates.filter((f) => path3.basename(f, ".md").toLowerCase() === target);
  if (exact.length === 0)
    return void 0;
  if (exact.length === 1)
    return exact[0];
  return exact.reduce((a, b) => a.length <= b.length ? a : b);
}
async function resolveWikilink(name, options) {
  const normalizedName = name.trim().replace(/\.md$/i, "");
  if (normalizedName === "") {
    return {
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "No file matches wikilink: (empty)" }
    };
  }
  if (normalizedName.includes("/")) {
    if (normalizedName.includes("..")) {
      return {
        ok: false,
        error: {
          code: "PERMISSION_DENIED",
          message: `Path traversal in wikilink: ${normalizedName}`
        }
      };
    }
    const directPath = normalizedName + ".md";
    return { ok: true, value: { resolvedPath: directPath, candidates: [] } };
  }
  const cacheKey = CACHE_PREFIX + normalizedName.toLowerCase();
  const cached = options.cache.get(cacheKey);
  if (cached !== void 0) {
    return { ok: true, value: { resolvedPath: cached, candidates: [] } };
  }
  if (options.mode === "full") {
    const searchResult = await options.cli.search(`file:${normalizedName}`);
    if (searchResult.ok) {
      const candidates = searchResult.value;
      const match = pickExactMatch(candidates, normalizedName);
      if (match !== void 0) {
        options.cache.set(cacheKey, match);
        return { ok: true, value: { resolvedPath: match, candidates } };
      }
    }
  }
  const globResult = await globFallback(normalizedName, options);
  if (globResult !== void 0) {
    options.cache.set(cacheKey, globResult);
    return { ok: true, value: { resolvedPath: globResult, candidates: [] } };
  }
  return {
    ok: false,
    error: { code: "FILE_NOT_FOUND", message: `No file matches wikilink: ${normalizedName}` }
  };
}

// ../core/dist/resolve-resource.js
import { access } from "node:fs/promises";
import path4 from "node:path";
var SKILL_FILENAME = "SKILL.md";
async function resolveSkillResource(name, dirs, securityOptions) {
  const trimmed = name.trim();
  for (const dir of dirs) {
    const vaultRelative = path4.join(dir, trimmed, SKILL_FILENAME);
    const canonical = canonicalizePath(vaultRelative, securityOptions.vaultRoot);
    if (!canonical.ok)
      continue;
    const allowed = checkAllowedFolder(canonical.value, securityOptions);
    if (!allowed.ok)
      continue;
    try {
      await access(canonical.value);
      return { ok: true, value: vaultRelative };
    } catch {
      continue;
    }
  }
  return {
    ok: false,
    error: { code: "FILE_NOT_FOUND", message: `Skill not found: ${trimmed}` }
  };
}
async function resolveResource(name, dirs, securityOptions) {
  const trimmed = name.trim();
  const fileName = trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
  for (const dir of dirs) {
    const vaultRelative = path4.join(dir, fileName);
    const canonical = canonicalizePath(vaultRelative, securityOptions.vaultRoot);
    if (!canonical.ok)
      continue;
    const allowed = checkAllowedFolder(canonical.value, securityOptions);
    if (!allowed.ok)
      continue;
    try {
      await access(canonical.value);
      return { ok: true, value: vaultRelative };
    } catch {
      continue;
    }
  }
  return {
    ok: false,
    error: { code: "FILE_NOT_FOUND", message: `Resource not found: ${trimmed}` }
  };
}

// ../core/dist/resolve-mention.js
import { access as access2 } from "node:fs/promises";
import path5 from "node:path";

// ../core/dist/uri.js
var URI_SCHEME = "obs";
var URI_PREFIX = `${URI_SCHEME}://`;
function buildObsUri(components) {
  const vault = encodeURIComponent(components.vaultName);
  const p = components.path.split("/").map(encodeURIComponent).join("/");
  let uri = `${URI_PREFIX}${vault}/${p}`;
  if (components.section !== void 0) {
    uri += `#${encodeURIComponent(components.section)}`;
  }
  return uri;
}

// ../core/dist/content-slice.js
var HEADING_REGEX = /^(#{1,6})\s+(.+)$/;
var WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
function sliceContent(markdown, heading) {
  const lines = markdown.split("\n");
  const target = heading.trim().toLowerCase();
  let startIndex = -1;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = HEADING_REGEX.exec(lines[i]);
    if (match) {
      const headingText = match[2].trim().toLowerCase();
      if (headingText === target && startIndex < 0) {
        startIndex = i;
        depth = match[1].length;
        continue;
      }
      if (startIndex >= 0 && match[1].length <= depth) {
        return { ok: true, value: lines.slice(startIndex, i).join("\n").trimEnd() };
      }
    }
  }
  if (startIndex >= 0) {
    return { ok: true, value: lines.slice(startIndex).join("\n").trimEnd() };
  }
  return {
    ok: false,
    error: { code: "FILE_NOT_FOUND", message: `Section not found: ${heading}` }
  };
}
function scrubWikilinks(markdown, vaultName) {
  return markdown.replace(WIKILINK_REGEX, (_match, target, display) => {
    const uri = buildObsUri({ vaultName, path: target, section: void 0 });
    return `[${display ?? target}](${uri})`;
  });
}
function processContent(markdown, options) {
  let result = markdown;
  if (options.section !== void 0) {
    const sliced = sliceContent(result, options.section);
    if (!sliced.ok)
      return sliced;
    result = sliced.value;
  }
  if (options.scrubWikilinks) {
    if (options.vaultName === void 0) {
      return {
        ok: false,
        error: { code: "INVALID_URI", message: "vaultName is required when scrubbing wikilinks" }
      };
    }
    result = scrubWikilinks(result, options.vaultName);
  }
  return { ok: true, value: result };
}

// ../core/dist/resolve-mention.js
var MENTION_PREFIX = `@${URI_SCHEME}:`;
var SKILL_PREFIX = `/${URI_SCHEME}:`;
function parseSection(reference) {
  const hashIndex = reference.indexOf("#");
  if (hashIndex < 0)
    return { namePart: reference, section: void 0 };
  const section = reference.slice(hashIndex + 1);
  return { namePart: reference.slice(0, hashIndex), section: section === "" ? void 0 : section };
}
async function readAndProcess(resolvedPath, section, tracker) {
  const content = await tracker.readFile(resolvedPath);
  if (!content.ok)
    return content;
  return processContent(content.value, {
    section,
    scrubWikilinks: true,
    vaultName: tracker.context.name
  });
}
async function resolveNonAgent(namePart, tracker, securityOptions) {
  if (tracker.context.vfsConfig.skillsDirs.length > 0) {
    const skillResult = await resolveSkillResource(namePart, tracker.context.vfsConfig.skillsDirs, securityOptions);
    if (skillResult.ok) {
      return { ok: true, value: { targetType: "skill", resolvedPath: skillResult.value } };
    }
  }
  if (namePart.includes("/") || namePart.toLowerCase().endsWith(".md")) {
    const absolutePath = path5.resolve(securityOptions.vaultRoot, namePart);
    try {
      await access2(absolutePath);
      return { ok: true, value: { targetType: "file", resolvedPath: namePart } };
    } catch {
      const basename = path5.basename(namePart, ".md");
      const wikilinkResult2 = await resolveWikilink(basename, {
        cli: tracker.cli,
        cache: tracker.cache,
        vaultRoot: tracker.context.physicalPath,
        allowedFolders: tracker.context.vfsConfig.allowedFolders,
        mode: tracker.context.mode
      });
      if (wikilinkResult2.ok) {
        return {
          ok: true,
          value: { targetType: "file", resolvedPath: wikilinkResult2.value.resolvedPath }
        };
      }
      return { ok: true, value: { targetType: "file", resolvedPath: namePart } };
    }
  }
  const wikilinkResult = await resolveWikilink(namePart, {
    cli: tracker.cli,
    cache: tracker.cache,
    vaultRoot: tracker.context.physicalPath,
    allowedFolders: tracker.context.vfsConfig.allowedFolders,
    mode: tracker.context.mode
  });
  if (!wikilinkResult.ok)
    return wikilinkResult;
  return {
    ok: true,
    value: { targetType: "file", resolvedPath: wikilinkResult.value.resolvedPath }
  };
}
async function resolveMention(mention, tracker) {
  if (!mention.startsWith(MENTION_PREFIX)) {
    return {
      ok: false,
      error: {
        code: "INVALID_URI",
        message: `Invalid ${MENTION_PREFIX} mention: missing prefix`
      }
    };
  }
  const raw = mention.slice(MENTION_PREFIX.length).trim();
  if (raw === "") {
    return {
      ok: false,
      error: {
        code: "INVALID_URI",
        message: `Invalid ${MENTION_PREFIX} mention: empty reference`
      }
    };
  }
  const { namePart, section } = parseSection(raw);
  if (namePart === "") {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: `Invalid ${MENTION_PREFIX} mention: empty path` }
    };
  }
  let targetType;
  let resolvedPath;
  const securityOptions = {
    vaultRoot: tracker.context.physicalPath,
    allowedFolders: tracker.context.vfsConfig.allowedFolders
  };
  if (tracker.context.vfsConfig.agentsDirs.length > 0) {
    const agentResult = await resolveResource(namePart, tracker.context.vfsConfig.agentsDirs, securityOptions);
    if (agentResult.ok) {
      targetType = "agent";
      resolvedPath = agentResult.value;
    } else {
      const resolved = await resolveNonAgent(namePart, tracker, securityOptions);
      if (!resolved.ok)
        return resolved;
      targetType = resolved.value.targetType;
      resolvedPath = resolved.value.resolvedPath;
    }
  } else {
    const resolved = await resolveNonAgent(namePart, tracker, securityOptions);
    if (!resolved.ok)
      return resolved;
    targetType = resolved.value.targetType;
    resolvedPath = resolved.value.resolvedPath;
  }
  const processed = await readAndProcess(resolvedPath, section, tracker);
  if (!processed.ok)
    return processed;
  return {
    ok: true,
    value: {
      targetType,
      resolvedPath,
      vaultName: tracker.context.name,
      content: processed.value,
      section
    }
  };
}
async function resolveSkillMention(mention, tracker) {
  if (!mention.startsWith(SKILL_PREFIX)) {
    return {
      ok: false,
      error: {
        code: "INVALID_URI",
        message: `Invalid ${SKILL_PREFIX} mention: missing prefix`
      }
    };
  }
  const raw = mention.slice(SKILL_PREFIX.length).trim();
  if (raw === "") {
    return {
      ok: false,
      error: {
        code: "INVALID_URI",
        message: `Invalid ${SKILL_PREFIX} mention: empty reference`
      }
    };
  }
  const { namePart, section } = parseSection(raw);
  if (namePart === "") {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: `Invalid ${SKILL_PREFIX} mention: empty path` }
    };
  }
  const skillResult = await tracker.resolveSkill(namePart);
  if (!skillResult.ok)
    return skillResult;
  const processed = await readAndProcess(skillResult.value, section, tracker);
  if (!processed.ok)
    return processed;
  return {
    ok: true,
    value: {
      targetType: "skill",
      resolvedPath: skillResult.value,
      vaultName: tracker.context.name,
      content: processed.value,
      section
    }
  };
}

// ../core/dist/file-watcher.js
import { watch } from "node:fs";
import path6 from "node:path";
var DEFAULT_DEBOUNCE_MS = 200;
var VaultFileWatcher = class {
  #vaultRoot;
  #cache;
  #debounceMs;
  #listeners;
  #pending;
  #watcher;
  constructor(vaultRoot, cache, debounceMs) {
    this.#vaultRoot = vaultRoot;
    this.#cache = cache;
    this.#debounceMs = debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.#listeners = /* @__PURE__ */ new Set();
    this.#pending = /* @__PURE__ */ new Map();
    this.#watcher = null;
  }
  /** Start watching. Idempotent — second call is a no-op. */
  start() {
    if (this.#watcher)
      return;
    try {
      this.#watcher = watch(this.#vaultRoot, { recursive: true }, this.#handleEvent.bind(this));
      this.#watcher.on("error", () => {
        this.stop();
      });
    } catch {
      this.#watcher = null;
    }
  }
  /** Stop watching and clear all pending timers. */
  stop() {
    this.#watcher?.close();
    this.#watcher = null;
    for (const timer of this.#pending.values()) {
      clearTimeout(timer);
    }
    this.#pending.clear();
  }
  /** Whether the watcher is currently active. */
  get isActive() {
    return this.#watcher !== null;
  }
  /** Register a listener for file change events. Returns a Disposable to unsubscribe. */
  onDidChange(listener) {
    this.#listeners.add(listener);
    return { dispose: () => this.#listeners.delete(listener) };
  }
  #handleEvent(eventType, filename) {
    if (filename === null)
      return;
    const absolutePath = path6.join(this.#vaultRoot, filename);
    const existing = this.#pending.get(absolutePath);
    if (existing !== void 0)
      clearTimeout(existing);
    const timer = setTimeout(() => {
      this.#pending.delete(absolutePath);
      this.#cache.delete(absolutePath);
      const changeType = this.#mapEventType(eventType);
      const event = { type: changeType, path: absolutePath };
      for (const listener of this.#listeners) {
        listener([event]);
      }
    }, this.#debounceMs);
    this.#pending.set(absolutePath, timer);
  }
  // node:fs.watch "rename" is ambiguous (create or delete); consumers use stat() to disambiguate.
  #mapEventType(_eventType) {
    return "changed";
  }
};

// ../core/dist/model-mapping.js
var CLAUDE_HAIKU = "haiku";
var CLAUDE_SONNET = "sonnet";
var CLAUDE_OPUS = "opus";
var CLAUDE_MODEL_RE = new RegExp(`${CLAUDE_HAIKU}|${CLAUDE_SONNET}|${CLAUDE_OPUS}`, "i");

// ../core/dist/frontmatter.js
var DESCRIPTION_RE = /^description:\s*(.+)$/m;
function extractFrontmatter(content) {
  if (!content.startsWith("---\n"))
    return void 0;
  const end = content.indexOf("\n---\n", 4);
  if (end === -1)
    return void 0;
  return content.slice(4, end);
}
function extractFrontmatterField(content, pattern) {
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter)
    return void 0;
  const match = pattern.exec(frontmatter);
  const value = match?.[1]?.trim();
  return value !== "" ? value : void 0;
}
function extractFrontmatterDescription(content) {
  return extractFrontmatterField(content, DESCRIPTION_RE);
}

// ../core/dist/local-index-tracker.js
var DEFAULT_CACHE_MAX_SIZE = 500;
var CONFIG_FILENAME = "obsidian-vfs.json";
var CONFIG_DIR = ".obsidian";
var SKILL_FILENAME2 = "SKILL.md";
var SAFE_RESOURCE_NAME_RE = /^[a-zA-Z0-9._-]+$/;
var LocalIndexTracker = class _LocalIndexTracker {
  /** Immutable vault state produced during initialization. */
  context;
  /** @internal LRU file-content cache. Used by internal modules for invalidation. */
  cache;
  /** @internal CLI instance. Used by internal resolution modules. */
  cli;
  #securityOptions;
  #watcher;
  constructor(context, cache, cli) {
    const frozenConfig = Object.freeze({
      agentsDirs: Object.freeze([...context.vfsConfig.agentsDirs]),
      skillsDirs: Object.freeze([...context.vfsConfig.skillsDirs]),
      allowedFolders: Object.freeze([...context.vfsConfig.allowedFolders])
    });
    this.context = Object.freeze({
      ...context,
      vfsConfig: frozenConfig
    });
    this.cache = cache;
    this.cli = cli;
    this.#securityOptions = {
      vaultRoot: context.physicalPath,
      allowedFolders: frozenConfig.allowedFolders
    };
    this.#watcher = null;
  }
  /**
   * Async factory. Discovers the vault, validates config, determines mode,
   * and returns a ready-to-use tracker. Returns an error result instead of
   * throwing when preconditions fail.
   */
  static async create(cli, options) {
    const pathResult = await cli.vaultPath();
    if (!pathResult.ok) {
      return {
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: pathResult.error.message }
      };
    }
    const physicalPath = pathResult.value;
    const nameResult = await cli.vaultName();
    if (!nameResult.ok) {
      return {
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: nameResult.error.message }
      };
    }
    const name = nameResult.value;
    let vfsConfig;
    const configPath = path7.join(physicalPath, CONFIG_DIR, CONFIG_FILENAME);
    try {
      const raw = await fsReadFile(configPath, "utf-8");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {
          ok: false,
          error: { code: "PARSE_ERROR", message: "Invalid JSON in obsidian-vfs.json" }
        };
      }
      const configResult = validateVFSConfig(parsed);
      if (!configResult.ok)
        return configResult;
      vfsConfig = configResult.value;
    } catch (err) {
      if (err.code === "ENOENT") {
        vfsConfig = { agentsDirs: [], skillsDirs: [], allowedFolders: [] };
      } else {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: `Cannot read config file: ${err.message}`
          }
        };
      }
    }
    const available = await cli.isAvailable();
    const mode = available ? "full" : "degraded";
    const context = { name, physicalPath, vfsConfig, mode };
    const maxSize = options?.cacheMaxSize ?? DEFAULT_CACHE_MAX_SIZE;
    const cache = new LRUCache(maxSize);
    return { ok: true, value: new _LocalIndexTracker(context, cache, cli) };
  }
  /**
   * Read a file from the vault with security validation and LRU caching.
   * Caches by canonicalized path so equivalent paths share a single entry.
   * Errors are never cached.
   */
  async readFile(virtualPath) {
    const canonical = canonicalizePath(virtualPath, this.context.physicalPath);
    if (!canonical.ok)
      return canonical;
    const cached = this.cache.get(canonical.value);
    if (cached !== void 0) {
      return { ok: true, value: cached };
    }
    const result = await readVirtualFile(virtualPath, this.#securityOptions);
    if (!result.ok)
      return result;
    const decoded = new TextDecoder().decode(result.value);
    this.cache.set(canonical.value, decoded);
    return { ok: true, value: decoded };
  }
  /** Resolve a bare wikilink name to a vault-relative path with search candidates. */
  async resolveWikilink(name) {
    return resolveWikilink(name, {
      cli: this.cli,
      cache: this.cache,
      vaultRoot: this.context.physicalPath,
      allowedFolders: this.context.vfsConfig.allowedFolders,
      mode: this.context.mode
    });
  }
  /** Resolve an agent by name from configured agentsDirs. */
  async resolveAgent(name) {
    return resolveResource(name, this.context.vfsConfig.agentsDirs, this.#securityOptions);
  }
  /** Resolve a skill by name as a directory containing SKILL.md from configured skillsDirs. */
  async resolveSkill(name) {
    return resolveSkillResource(name, this.context.vfsConfig.skillsDirs, this.#securityOptions);
  }
  /** Parse and resolve an `@obs:` mention to a full MentionResult. */
  async resolveMention(mention) {
    return resolveMention(mention, this);
  }
  /** List directory contents with security enforcement. */
  async readDirectory(virtualPath) {
    return readDirectory(virtualPath, this.#securityOptions);
  }
  /** Recursively enumerate all markdown files in the vault. */
  async listFiles() {
    return listMarkdownFiles(this.#securityOptions);
  }
  /** Get file or directory metadata. */
  async stat(virtualPath) {
    return statVirtualFile(virtualPath, this.#securityOptions);
  }
  /** Enumerate all skills from configured skillsDirs with deduplication. */
  async listSkills() {
    const { skillsDirs } = this.context.vfsConfig;
    const seen = /* @__PURE__ */ new Set();
    const skills = [];
    for (const dir of skillsDirs) {
      const entries = await this.readDirectory(dir);
      if (!entries.ok)
        continue;
      for (const [name, type] of entries.value) {
        if (type !== "directory" || seen.has(name) || !SAFE_RESOURCE_NAME_RE.test(name))
          continue;
        seen.add(name);
        const skillPath = path7.join(dir, name, SKILL_FILENAME2);
        const content = await this.readFile(skillPath);
        if (!content.ok)
          continue;
        const description = extractFrontmatterDescription(content.value) ?? `Obsidian vault skill: ${name}`;
        skills.push({ name, description, vaultRelativePath: skillPath });
      }
    }
    return { ok: true, value: skills };
  }
  /** Enumerate all agents from configured agentsDirs with deduplication. */
  async listAgents() {
    const { agentsDirs } = this.context.vfsConfig;
    const seen = /* @__PURE__ */ new Set();
    const agents = [];
    for (const dir of agentsDirs) {
      const entries = await this.readDirectory(dir);
      if (!entries.ok)
        continue;
      for (const [fileName, type] of entries.value) {
        if (type !== "file" || !fileName.endsWith(".md"))
          continue;
        const name = fileName.slice(0, -3);
        if (seen.has(name) || !SAFE_RESOURCE_NAME_RE.test(name))
          continue;
        seen.add(name);
        const agentPath = path7.join(dir, fileName);
        const content = await this.readFile(agentPath);
        if (!content.ok)
          continue;
        const description = extractFrontmatterDescription(content.value) ?? `Obsidian vault agent: ${name}`;
        agents.push({ name, description, vaultRelativePath: agentPath });
      }
    }
    return { ok: true, value: agents };
  }
  /** Start watching the vault for file changes. Returns a Disposable to stop. */
  startWatching(debounceMs) {
    if (!this.#watcher) {
      this.#watcher = new VaultFileWatcher(this.context.physicalPath, this.cache, debounceMs);
      this.#watcher.start();
    }
    return { dispose: () => this.stopWatching() };
  }
  /** Stop watching the vault for file changes. */
  stopWatching() {
    this.#watcher?.stop();
    this.#watcher = null;
  }
  /** Register a listener for file change events. Starts watcher if not active. */
  onDidChangeFile(listener) {
    if (!this.#watcher) {
      this.startWatching();
    }
    return this.#watcher.onDidChange(listener);
  }
};

// ../core/dist/parsers.js
function isSearchMatch(v) {
  return typeof v === "object" && v !== null && "file" in v && typeof v.file === "string";
}
function isBacklinkEntry(v) {
  return typeof v === "object" && v !== null && "file" in v && typeof v.file === "string";
}
function detectCLIError(stdout, command) {
  if (stdout.startsWith("Error:")) {
    return { ok: false, error: { code: "CLI_ERROR", message: stdout, command } };
  }
  return void 0;
}
function parseSingleValue(stdout, command) {
  const err = detectCLIError(stdout, command);
  if (err)
    return err;
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: { code: "PARSE_ERROR", message: "Empty output", command } };
  }
  return { ok: true, value: trimmed };
}
function parseLineList(stdout, command) {
  const err = detectCLIError(stdout, command);
  if (err)
    return err;
  const lines = stdout.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return { ok: true, value: lines };
}
function parseSearchJSON(stdout, command) {
  const err = detectCLIError(stdout, command);
  if (err)
    return err;
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed) || !parsed.every(isSearchMatch)) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: "Expected SearchMatch[]", command }
      };
    }
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "Invalid JSON", command }
    };
  }
}
function parseBacklinksJSON(stdout, command) {
  const err = detectCLIError(stdout, command);
  if (err)
    return err;
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed) || !parsed.every(isBacklinkEntry)) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: "Expected BacklinkEntry[]", command }
      };
    }
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "Invalid JSON", command }
    };
  }
}
function isStringArray2(v) {
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}
function parseSearchFiles(stdout, command) {
  const err = detectCLIError(stdout, command);
  if (err)
    return err;
  if (stdout.trim().length === 0) {
    return { ok: true, value: [] };
  }
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: "Expected JSON array", command }
      };
    }
    if (isStringArray2(parsed)) {
      return { ok: true, value: parsed };
    }
    if (parsed.every(isSearchMatch)) {
      return { ok: true, value: parsed.map((m) => m.file) };
    }
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "Expected string[] or SearchMatch[]", command }
    };
  } catch {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "Invalid JSON", command }
    };
  }
}

// ../core/dist/queue.js
var AsyncQueue = class {
  #tail;
  constructor() {
    this.#tail = Promise.resolve();
  }
  /** Appends `fn` to the queue, executing it after all prior tasks settle. */
  enqueue(fn) {
    const task = this.#tail.then(() => fn());
    this.#tail = task.then(() => void 0, () => void 0);
    return task;
  }
};

// ../core/dist/obsidian-cli.js
var ObsidianCLIImpl = class {
  #options;
  #queue;
  constructor(options) {
    this.#options = options;
    this.#queue = new AsyncQueue();
  }
  /** Retrieves the absolute path to the vault root directory. */
  async vaultPath() {
    return this.#queue.enqueue(async () => {
      const result = await execCLI(["vault", "info=path"], this.#options);
      if (!result.ok)
        return result;
      return parseSingleValue(result.value.stdout, "vault info=path");
    });
  }
  /** Retrieves the human-readable vault name. */
  async vaultName() {
    return this.#queue.enqueue(async () => {
      const result = await execCLI(["vault", "info=name"], this.#options);
      if (!result.ok)
        return result;
      return parseSingleValue(result.value.stdout, "vault info=name");
    });
  }
  /** Performs full-text search returning matching file paths. */
  async search(query, opts) {
    return this.#queue.enqueue(async () => {
      const args = ["search", `query=${query}`, "format=json", ...this.#buildSearchOpts(opts)];
      const result = await execCLI(args, this.#options);
      if (!result.ok)
        return result;
      return parseSearchFiles(result.value.stdout, args.join(" "));
    });
  }
  /** Performs full-text search returning matches with per-line context. */
  async searchContext(query, opts) {
    return this.#queue.enqueue(async () => {
      const args = ["search", `query=${query}`, "format=json", ...this.#buildSearchOpts(opts)];
      const result = await execCLI(args, this.#options);
      if (!result.ok)
        return result;
      return parseSearchJSON(result.value.stdout, args.join(" "));
    });
  }
  /** Lists files, optionally scoped to a folder. */
  async files(folder) {
    return this.#queue.enqueue(async () => {
      const args = ["files", ...folder ? [folder] : []];
      const result = await execCLI(args, this.#options);
      if (!result.ok)
        return result;
      return parseLineList(result.value.stdout, args.join(" "));
    });
  }
  /** Lists folders, optionally scoped to a parent folder. */
  async folders(folder) {
    return this.#queue.enqueue(async () => {
      const args = ["folders", ...folder ? [folder] : []];
      const result = await execCLI(args, this.#options);
      if (!result.ok)
        return result;
      return parseLineList(result.value.stdout, args.join(" "));
    });
  }
  /** Retrieves incoming wikilink references to the given file. */
  async backlinks(file) {
    return this.#queue.enqueue(async () => {
      const args = ["backlinks", file];
      const result = await execCLI(args, this.#options);
      if (!result.ok)
        return result;
      return parseBacklinksJSON(result.value.stdout, args.join(" "));
    });
  }
  /** Retrieves outgoing wikilink references from the given file. */
  async links(file) {
    return this.#queue.enqueue(async () => {
      const args = ["links", file];
      const result = await execCLI(args, this.#options);
      if (!result.ok)
        return result;
      return parseLineList(result.value.stdout, args.join(" "));
    });
  }
  /** Retrieves the path to today's daily note. */
  async dailyPath() {
    return this.#queue.enqueue(async () => {
      const result = await execCLI(["daily", "info=path"], this.#options);
      if (!result.ok)
        return result;
      return parseSingleValue(result.value.stdout, "daily info=path");
    });
  }
  /** Lists all tags in the vault, optionally sorted. */
  async tags(opts) {
    return this.#queue.enqueue(async () => {
      const args = ["tags", ...opts?.sort ? [`sort=${opts.sort}`] : []];
      const result = await execCLI(args, this.#options);
      if (!result.ok)
        return result;
      return parseLineList(result.value.stdout, args.join(" "));
    });
  }
  /** Reads a frontmatter property value from a note. */
  async propertyRead(file, name) {
    return this.#queue.enqueue(async () => {
      const args = ["property-read", file, name];
      const result = await execCLI(args, this.#options);
      if (!result.ok)
        return result;
      return parseSingleValue(result.value.stdout, args.join(" "));
    });
  }
  /** Health-check probe. Bypasses queue, returns true if CLI is reachable. */
  async isAvailable() {
    const result = await execCLI(["vault", "info=path"], this.#options);
    return result.ok;
  }
  /** Opens a note in Obsidian's UI via CLI. */
  async open(file, newtab) {
    return this.#queue.enqueue(async () => {
      const args = ["open", `path=${file}`, ...newtab ? ["newtab"] : []];
      const result = await execCLI(args, this.#options);
      if (!result.ok)
        return result;
      const err = detectCLIError(result.value.stdout, args.join(" "));
      if (err)
        return err;
      return { ok: true, value: void 0 };
    });
  }
  /** Builds CLI args for search options (path, limit, contextLength). */
  #buildSearchOpts(opts) {
    if (!opts)
      return [];
    const args = [];
    if (opts.path !== void 0)
      args.push(`path=${opts.path}`);
    if (opts.limit !== void 0)
      args.push(`limit=${opts.limit}`);
    if (opts.contextLength !== void 0)
      args.push(`context-length=${opts.contextLength}`);
    return args;
  }
};

// ../core/dist/bootstrap.js
async function bootstrapTracker(config) {
  const start = performance.now();
  const cli = new ObsidianCLIImpl({
    cliPath: config.cliPath,
    timeoutMs: config.timeoutMs
  });
  const result = await LocalIndexTracker.create(cli);
  if (!result.ok)
    return result;
  const initMs = performance.now() - start;
  return { ok: true, value: { tracker: result.value, initMs } };
}

// src/mention-extractor.ts
var FENCED_CODE_BLOCK = /```[\s\S]*?```/g;
var INLINE_CODE = /`[^`]+`/g;
var MENTION_PATTERN = new RegExp(`([@/])${URI_SCHEME}:([^\\s]+)`, "g");
var TRAILING_PUNCT = /[,.)!?;:]+$/;
function replaceWithSpaces(text, pattern) {
  return text.replace(pattern, (match) => " ".repeat(match.length));
}
function maskCodeRegions(text) {
  let masked = replaceWithSpaces(text, FENCED_CODE_BLOCK);
  masked = replaceWithSpaces(masked, INLINE_CODE);
  return masked;
}
function extractMentions(prompt) {
  const masked = maskCodeRegions(prompt);
  const seen = /* @__PURE__ */ new Map();
  const regex = new RegExp(MENTION_PATTERN.source, MENTION_PATTERN.flags);
  let match;
  while ((match = regex.exec(masked)) !== null) {
    const prefix = match[1];
    let raw = match[0];
    let reference = match[2];
    raw = raw.replace(TRAILING_PUNCT, "");
    reference = reference.replace(TRAILING_PUNCT, "");
    if (reference === "") continue;
    const kind = prefix === "/" ? "skill" : "context";
    if (!seen.has(raw)) {
      seen.set(raw, {
        kind,
        raw,
        reference,
        startIndex: match.index,
        endIndex: match.index + raw.length
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.startIndex - b.startIndex);
}

// src/context-formatter.ts
var BLOCK_SEPARATOR = "\n\n";
function formatHeader(raw, targetType, resolvedPath, section) {
  const sectionPart = section !== void 0 ? `, section: ${section}` : "";
  return `--- ${raw} (${targetType}, ${resolvedPath}${sectionPart}) ---`;
}
function formatResolved(mention) {
  const header = formatHeader(
    mention.mention.raw,
    mention.targetType,
    mention.resolvedPath,
    mention.section
  );
  return `${header}
${mention.content}`;
}
function formatError(mention) {
  return `[obs: ${mention.mention.raw} -- Error: ${mention.errorMessage}]`;
}
function formatContext(mentions) {
  if (mentions.length === 0) return "";
  const blocks = mentions.map((m) => {
    if (m.status === "resolved") return formatResolved(m);
    return formatError(m);
  });
  return blocks.join(BLOCK_SEPARATOR);
}

// src/hook-handler.ts
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function parseInput(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed;
  if (obj.hook_event_name !== "UserPromptSubmit") return null;
  if (typeof obj.prompt !== "string") return null;
  if (typeof obj.session_id !== "string") return null;
  if (typeof obj.transcript_path !== "string") return null;
  if (typeof obj.cwd !== "string") return null;
  return obj;
}
function writeOutput(output) {
  process.stdout.write(JSON.stringify(output) + "\n");
}
async function resolveSkillMention2(mention, tracker) {
  const result = await resolveSkillMention(SKILL_PREFIX + mention.reference, tracker);
  if (result.ok) {
    return {
      status: "resolved",
      mention,
      targetType: result.value.targetType,
      resolvedPath: result.value.resolvedPath,
      section: result.value.section,
      content: result.value.content
    };
  }
  return { status: "error", mention, errorMessage: result.error.message };
}
async function resolveSingleMention(mention, tracker) {
  if (mention.kind === "skill") {
    return resolveSkillMention2(mention, tracker);
  }
  const fullMention = MENTION_PREFIX + mention.reference;
  const result = await resolveMention(fullMention, tracker);
  if (result.ok) {
    return {
      status: "resolved",
      mention,
      targetType: result.value.targetType,
      resolvedPath: result.value.resolvedPath,
      section: result.value.section,
      content: result.value.content
    };
  }
  return {
    status: "error",
    mention,
    errorMessage: result.error.message
  };
}
async function main() {
  const raw = await readStdin();
  const input = parseInput(raw);
  if (input === null) {
    writeOutput({});
    return;
  }
  const mentions = extractMentions(input.prompt);
  if (mentions.length === 0) {
    writeOutput({});
    return;
  }
  const config = resolveExecConfig(process.env);
  const boot = await bootstrapTracker(config);
  if (!boot.ok) {
    const errorBlocks = mentions.map((m) => `[obs: ${m.raw} -- Error: ${boot.error.message}]`);
    writeOutput({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: errorBlocks.join("\n\n")
      }
    });
    return;
  }
  const resolved = await Promise.all(
    mentions.map((m) => resolveSingleMention(m, boot.value.tracker))
  );
  const context = formatContext(resolved);
  if (context === "") {
    writeOutput({});
    return;
  }
  writeOutput({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context
    }
  });
}
main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`obsidian-vfs plugin error: ${message}
`);
  process.stdout.write("{}\n");
});
export {
  parseInput
};
