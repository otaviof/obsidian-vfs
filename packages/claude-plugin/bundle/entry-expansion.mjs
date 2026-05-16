// ../core/dist/types.js
var ERRNO = {
  ENOENT: "ENOENT",
  ENOTDIR: "ENOTDIR",
  EACCES: "EACCES"
};
var ERR = {
  VAULT_NOT_FOUND: "VAULT_NOT_FOUND",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  PARSE_ERROR: "PARSE_ERROR",
  CLI_ERROR: "CLI_ERROR",
  CLI_UNAVAILABLE: "CLI_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  INVALID_URI: "INVALID_URI"
};

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
        error: { code: ERR.TIMEOUT, message: `CLI timed out after ${options.timeoutMs}ms` }
      };
    }
    if (err instanceof Error && "code" in err && err.code === ERRNO.ENOENT) {
      return {
        ok: false,
        error: {
          code: ERR.CLI_UNAVAILABLE,
          message: `CLI binary not found: ${options.cliPath}`
        }
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: ERR.CLI_ERROR, message } };
  } finally {
    clearTimeout(timer);
  }
}

// ../core/dist/local-index-tracker.js
import { readFile as fsReadFile } from "node:fs/promises";
import path8 from "node:path";

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
import path from "node:path";
var DEFAULT_VFS_CONFIG = {
  agents: [],
  skills: [],
  allowed: [],
  blocked: []
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
      error: { code: ERR.PARSE_ERROR, message: "VFSConfig must be a non-null object" }
    };
  }
  const obj = raw;
  const fields = ["agents", "skills", "allowed", "blocked"];
  for (const field of fields) {
    if (field in obj && !isStringArray(obj[field])) {
      return {
        ok: false,
        error: { code: ERR.PARSE_ERROR, message: `${field} must be string[]` }
      };
    }
  }
  const normalize = (s) => path.normalize(s).replace(/\/+$/, "");
  const agents = (obj.agents ?? []).map(normalize);
  const skills = (obj.skills ?? []).map(normalize);
  const allowed = (obj.allowed ?? []).map(normalize);
  const blocked = (obj.blocked ?? []).map(normalize);
  for (const b of blocked) {
    for (const a of allowed) {
      if (b === a) {
        return {
          ok: false,
          error: {
            code: ERR.PARSE_ERROR,
            message: `"${b}" appears in both "allowed" and "blocked"`
          }
        };
      }
      if (a.startsWith(b + "/")) {
        return {
          ok: false,
          error: {
            code: ERR.PARSE_ERROR,
            message: `blocked entry "${b}" is a parent of allowed entry "${a}"`
          }
        };
      }
    }
  }
  return {
    ok: true,
    value: { agents, skills, allowed, blocked }
  };
}

// ../core/dist/path-security.js
import { realpath } from "node:fs/promises";
import path2 from "node:path";
function canonicalizePath(virtualPath, vaultRoot) {
  const resolved = path2.resolve(vaultRoot, virtualPath);
  if (resolved !== vaultRoot && !resolved.startsWith(vaultRoot + path2.sep)) {
    return {
      ok: false,
      error: { code: ERR.PERMISSION_DENIED, message: "Path resolves outside vault root" }
    };
  }
  return { ok: true, value: resolved };
}
function checkBlockedFolder(absolutePath, options) {
  for (const folder of options.blocked) {
    const blockedAbs = path2.resolve(options.vaultRoot, folder);
    if (absolutePath === blockedAbs || absolutePath.startsWith(blockedAbs + path2.sep)) {
      return {
        ok: false,
        error: { code: ERR.PERMISSION_DENIED, message: "Path within blocked folders" }
      };
    }
  }
  return { ok: true, value: absolutePath };
}
function checkAllowedFolder(absolutePath, options) {
  const blockedResult = checkBlockedFolder(absolutePath, options);
  if (!blockedResult.ok)
    return blockedResult;
  if (options.allowed.length === 0) {
    return { ok: true, value: absolutePath };
  }
  for (const folder of options.allowed) {
    const allowed = path2.resolve(options.vaultRoot, folder);
    if (absolutePath === allowed || absolutePath.startsWith(allowed + path2.sep)) {
      return { ok: true, value: absolutePath };
    }
    if (allowed.startsWith(absolutePath + path2.sep)) {
      return { ok: true, value: absolutePath };
    }
  }
  return {
    ok: false,
    error: { code: ERR.PERMISSION_DENIED, message: "Path not within allowed folders" }
  };
}
function isAllowedPath(virtualPath, options) {
  const canonical = canonicalizePath(virtualPath, options.vaultRoot);
  if (!canonical.ok)
    return false;
  return checkAllowedFolder(canonical.value, options).ok;
}
async function checkSymlink(absolutePath, vaultRoot) {
  try {
    const real = await realpath(absolutePath);
    if (real !== vaultRoot && !real.startsWith(vaultRoot + path2.sep)) {
      return {
        ok: false,
        error: { code: ERR.PERMISSION_DENIED, message: "Symlink resolves outside vault root" }
      };
    }
    return { ok: true, value: real };
  } catch (err) {
    if (err.code === ERRNO.ENOENT) {
      return {
        ok: false,
        error: { code: ERR.FILE_NOT_FOUND, message: `File does not exist: ${absolutePath}` }
      };
    }
    return {
      ok: false,
      error: { code: ERR.PERMISSION_DENIED, message: `Cannot resolve path: ${absolutePath}` }
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
    if (errno.code === ERRNO.ENOENT) {
      return {
        ok: false,
        error: { code: ERR.FILE_NOT_FOUND, message: `File does not exist: ${pathResult.value}` }
      };
    }
    if (errno.code === ERRNO.EACCES) {
      return {
        ok: false,
        error: { code: ERR.PERMISSION_DENIED, message: `Permission denied: ${pathResult.value}` }
      };
    }
    return {
      ok: false,
      error: { code: ERR.CLI_ERROR, message: err.message }
    };
  }
}

// ../core/dist/resolve-wikilink.js
import path4 from "node:path";

// ../core/dist/fs-enumeration.js
import { readdir, stat } from "node:fs/promises";
import path3 from "node:path";
async function readDirectory(virtualPath, options) {
  const canonical = canonicalizePath(virtualPath, options.vaultRoot);
  if (!canonical.ok)
    return canonical;
  const parentAllowed = checkAllowedFolder(canonical.value, options);
  if (!parentAllowed.ok)
    return parentAllowed;
  let entries;
  try {
    entries = await readdir(canonical.value, { withFileTypes: true });
  } catch (err) {
    const code = err.code;
    if (code === ERRNO.ENOENT) {
      return {
        ok: false,
        error: { code: ERR.FILE_NOT_FOUND, message: `Directory does not exist: ${virtualPath}` }
      };
    }
    if (code === ERRNO.ENOTDIR) {
      return {
        ok: false,
        error: { code: ERR.FILE_NOT_FOUND, message: `Not a directory: ${virtualPath}` }
      };
    }
    return {
      ok: false,
      error: { code: ERR.CLI_ERROR, message: err.message }
    };
  }
  const tuples = [];
  for (const entry of entries) {
    if (entry.name.startsWith("."))
      continue;
    const childAbsolute = path3.join(canonical.value, entry.name);
    const childAllowed = checkAllowedFolder(childAbsolute, options);
    if (!childAllowed.ok)
      continue;
    tuples.push([entry.name, entry.isDirectory() ? "directory" : "file"]);
  }
  tuples.sort((a, b) => a[0].localeCompare(b[0]));
  return { ok: true, value: tuples };
}
async function walkVault(options, depthLimit, collect) {
  const effectiveLimit = depthLimit === 0 ? Infinity : depthLimit;
  const searchRoots = options.allowed.length > 0 ? options.allowed.map((f) => path3.resolve(options.vaultRoot, f)) : [options.vaultRoot];
  const results = [];
  for (const root of searchRoots) {
    if (root === options.vaultRoot)
      continue;
    const rel = path3.relative(options.vaultRoot, root);
    if (collect(rel, true))
      results.push(rel);
  }
  let queue = searchRoots.map((dir) => [dir, 1]);
  while (queue.length > 0) {
    const nextQueue = [];
    for (const [dir, depth] of queue) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name.startsWith("."))
          continue;
        const childAbsolute = path3.join(dir, entry.name);
        if (!checkAllowedFolder(childAbsolute, options).ok)
          continue;
        const relativePath = path3.relative(options.vaultRoot, childAbsolute);
        const isDir = entry.isDirectory();
        if (collect(relativePath, isDir)) {
          results.push(relativePath);
        }
        if (isDir && depth < effectiveLimit) {
          nextQueue.push([childAbsolute, depth + 1]);
        }
      }
    }
    queue = nextQueue;
  }
  results.sort();
  return results;
}
async function listMarkdownFiles(options, depthLimit = 0) {
  const files = await walkVault(options, depthLimit, (rel, isDir) => !isDir && rel.toLowerCase().endsWith(".md"));
  return { ok: true, value: files };
}
async function listFolders(options, depthLimit = 0) {
  const folders = await walkVault(options, depthLimit, (_, isDir) => isDir);
  return { ok: true, value: folders };
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
    if (err.code === ERRNO.ENOENT) {
      return {
        ok: false,
        error: { code: ERR.FILE_NOT_FOUND, message: `File does not exist: ${virtualPath}` }
      };
    }
    return {
      ok: false,
      error: { code: ERR.CLI_ERROR, message: err.message }
    };
  }
}

// ../core/dist/resolve-wikilink.js
function securityOptions(options) {
  return { vaultRoot: options.vaultRoot, allowed: options.allowed, blocked: options.blocked };
}
async function globFallback(normalizedName, options) {
  const target = normalizedName.toLowerCase();
  const result = await listMarkdownFiles(securityOptions(options));
  if (!result.ok)
    return void 0;
  for (const filePath of result.value) {
    if (path4.basename(filePath, ".md").toLowerCase() === target) {
      return filePath;
    }
  }
  return void 0;
}
var CACHE_PREFIX = "wikilink::";
function pickExactMatch(candidates, normalizedName) {
  const target = normalizedName.toLowerCase();
  const exact = candidates.filter((f) => path4.basename(f, ".md").toLowerCase() === target);
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
      error: { code: ERR.FILE_NOT_FOUND, message: "No file matches wikilink: (empty)" }
    };
  }
  if (normalizedName.includes("/")) {
    if (normalizedName.includes("..")) {
      return {
        ok: false,
        error: {
          code: ERR.PERMISSION_DENIED,
          message: `Path traversal in wikilink: ${normalizedName}`
        }
      };
    }
    const directPath = normalizedName + ".md";
    if (!isAllowedPath(directPath, securityOptions(options))) {
      return {
        ok: false,
        error: { code: ERR.PERMISSION_DENIED, message: "Path not within allowed folders" }
      };
    }
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
    error: { code: ERR.FILE_NOT_FOUND, message: `No file matches wikilink: ${normalizedName}` }
  };
}

// ../core/dist/resolve-resource.js
import { access } from "node:fs/promises";
import path5 from "node:path";
var SKILL_FILENAME = "SKILL.md";
async function resolveSkillResource(name, dirs, securityOptions2) {
  const trimmed = name.trim();
  for (const dir of dirs) {
    const vaultRelative = path5.join(dir, trimmed, SKILL_FILENAME);
    const canonical = canonicalizePath(vaultRelative, securityOptions2.vaultRoot);
    if (!canonical.ok)
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
    error: { code: ERR.FILE_NOT_FOUND, message: `Skill not found: ${trimmed}` }
  };
}
async function resolveResource(name, dirs, securityOptions2) {
  const trimmed = name.trim();
  const fileName = trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
  for (const dir of dirs) {
    const vaultRelative = path5.join(dir, fileName);
    const canonical = canonicalizePath(vaultRelative, securityOptions2.vaultRoot);
    if (!canonical.ok)
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
    error: { code: ERR.FILE_NOT_FOUND, message: `Resource not found: ${trimmed}` }
  };
}

// ../core/dist/resolve-mention.js
import { access as access2 } from "node:fs/promises";
import path6 from "node:path";

// ../core/dist/uri.js
var URI_SCHEME = "obs";
var URI_PREFIX = `${URI_SCHEME}://`;
function parseObsUri(uri) {
  if (!uri.toLowerCase().startsWith(URI_PREFIX)) {
    return {
      ok: false,
      error: {
        code: ERR.INVALID_URI,
        message: `Invalid ${URI_PREFIX} URI: missing or wrong scheme`
      }
    };
  }
  const rest = uri.slice(URI_PREFIX.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex < 0) {
    return {
      ok: false,
      error: { code: ERR.INVALID_URI, message: `Invalid ${URI_PREFIX} URI: missing path` }
    };
  }
  const rawVault = rest.slice(0, slashIndex);
  if (rawVault === "") {
    return {
      ok: false,
      error: { code: ERR.INVALID_URI, message: `Invalid ${URI_PREFIX} URI: empty vault name` }
    };
  }
  const afterVault = rest.slice(slashIndex + 1);
  const hashIndex = afterVault.indexOf("#");
  let rawPath;
  let rawSection;
  if (hashIndex < 0) {
    rawPath = afterVault;
    rawSection = void 0;
  } else {
    rawPath = afterVault.slice(0, hashIndex);
    const sectionPart = afterVault.slice(hashIndex + 1);
    rawSection = sectionPart === "" ? void 0 : sectionPart;
  }
  if (rawPath === "") {
    return {
      ok: false,
      error: { code: ERR.INVALID_URI, message: `Invalid ${URI_PREFIX} URI: empty path` }
    };
  }
  try {
    return {
      ok: true,
      value: {
        vaultName: decodeURIComponent(rawVault),
        path: decodeURIComponent(rawPath),
        section: rawSection !== void 0 ? decodeURIComponent(rawSection) : void 0
      }
    };
  } catch {
    return {
      ok: false,
      error: {
        code: ERR.INVALID_URI,
        message: `Invalid ${URI_PREFIX} URI: malformed percent-encoding`
      }
    };
  }
}
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
    error: { code: ERR.FILE_NOT_FOUND, message: `Section not found: ${heading}` }
  };
}
function scrubWikilinks(markdown, vaultName) {
  return markdown.replace(WIKILINK_REGEX, (_match, target, display) => {
    const hashIndex = target.indexOf("#");
    const path9 = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const section = hashIndex >= 0 ? target.slice(hashIndex + 1) : void 0;
    const uri = buildObsUri({ vaultName, path: path9, section });
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
        error: { code: ERR.INVALID_URI, message: "vaultName is required when scrubbing wikilinks" }
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
async function resolveNonAgent(namePart, tracker, securityOptions2) {
  if (tracker.context.vfsConfig.skills.length > 0) {
    const skillResult = await resolveSkillResource(namePart, tracker.context.vfsConfig.skills, securityOptions2);
    if (skillResult.ok) {
      return { ok: true, value: { targetType: "skill", resolvedPath: skillResult.value } };
    }
  }
  if (namePart.includes("/") || namePart.toLowerCase().endsWith(".md")) {
    if (!isAllowedPath(namePart, securityOptions2)) {
      return {
        ok: false,
        error: { code: ERR.PERMISSION_DENIED, message: "Path not within allowed folders" }
      };
    }
    const absolutePath = path6.resolve(securityOptions2.vaultRoot, namePart);
    try {
      await access2(absolutePath);
      return { ok: true, value: { targetType: "file", resolvedPath: namePart } };
    } catch {
      const basename = path6.basename(namePart, ".md");
      const wikilinkResult2 = await resolveWikilink(basename, {
        cli: tracker.cli,
        cache: tracker.cache,
        vaultRoot: tracker.context.physicalPath,
        allowed: tracker.context.vfsConfig.allowed,
        blocked: tracker.context.vfsConfig.blocked,
        mode: tracker.context.mode
      });
      if (wikilinkResult2.ok) {
        return {
          ok: true,
          value: { targetType: "file", resolvedPath: wikilinkResult2.value.resolvedPath }
        };
      }
      return wikilinkResult2;
    }
  }
  const wikilinkResult = await resolveWikilink(namePart, {
    cli: tracker.cli,
    cache: tracker.cache,
    vaultRoot: tracker.context.physicalPath,
    allowed: tracker.context.vfsConfig.allowed,
    blocked: tracker.context.vfsConfig.blocked,
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
        code: ERR.INVALID_URI,
        message: `Invalid ${MENTION_PREFIX} mention: missing prefix`
      }
    };
  }
  const raw = mention.slice(MENTION_PREFIX.length).trim();
  if (raw === "") {
    return {
      ok: false,
      error: {
        code: ERR.INVALID_URI,
        message: `Invalid ${MENTION_PREFIX} mention: empty reference`
      }
    };
  }
  const { namePart, section } = parseSection(raw);
  if (namePart === "") {
    return {
      ok: false,
      error: { code: ERR.INVALID_URI, message: `Invalid ${MENTION_PREFIX} mention: empty path` }
    };
  }
  let targetType;
  let resolvedPath;
  const securityOptions2 = {
    vaultRoot: tracker.context.physicalPath,
    allowed: tracker.context.vfsConfig.allowed,
    blocked: tracker.context.vfsConfig.blocked
  };
  if (tracker.context.vfsConfig.agents.length > 0) {
    const agentResult = await resolveResource(namePart, tracker.context.vfsConfig.agents, securityOptions2);
    if (agentResult.ok) {
      targetType = "agent";
      resolvedPath = agentResult.value;
    } else {
      const resolved = await resolveNonAgent(namePart, tracker, securityOptions2);
      if (!resolved.ok)
        return resolved;
      targetType = resolved.value.targetType;
      resolvedPath = resolved.value.resolvedPath;
    }
  } else {
    const resolved = await resolveNonAgent(namePart, tracker, securityOptions2);
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
        code: ERR.INVALID_URI,
        message: `Invalid ${SKILL_PREFIX} mention: missing prefix`
      }
    };
  }
  const raw = mention.slice(SKILL_PREFIX.length).trim();
  if (raw === "") {
    return {
      ok: false,
      error: {
        code: ERR.INVALID_URI,
        message: `Invalid ${SKILL_PREFIX} mention: empty reference`
      }
    };
  }
  const { namePart, section } = parseSection(raw);
  if (namePart === "") {
    return {
      ok: false,
      error: { code: ERR.INVALID_URI, message: `Invalid ${SKILL_PREFIX} mention: empty path` }
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
import path7 from "node:path";
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
    const absolutePath = path7.join(this.#vaultRoot, filename);
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
      agents: Object.freeze([...context.vfsConfig.agents]),
      skills: Object.freeze([...context.vfsConfig.skills]),
      allowed: Object.freeze([...context.vfsConfig.allowed]),
      blocked: Object.freeze([...context.vfsConfig.blocked])
    });
    this.context = Object.freeze({
      ...context,
      vfsConfig: frozenConfig
    });
    this.cache = cache;
    this.cli = cli;
    this.#securityOptions = {
      vaultRoot: context.physicalPath,
      allowed: frozenConfig.allowed,
      blocked: frozenConfig.blocked
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
        error: { code: ERR.VAULT_NOT_FOUND, message: pathResult.error.message }
      };
    }
    const physicalPath = pathResult.value;
    const nameResult = await cli.vaultName();
    if (!nameResult.ok) {
      return {
        ok: false,
        error: { code: ERR.VAULT_NOT_FOUND, message: nameResult.error.message }
      };
    }
    const name = nameResult.value;
    let vfsConfig;
    const configPath = path8.join(physicalPath, CONFIG_DIR, CONFIG_FILENAME);
    try {
      const raw = await fsReadFile(configPath, "utf-8");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {
          ok: false,
          error: { code: ERR.PARSE_ERROR, message: "Invalid JSON in obsidian-vfs.json" }
        };
      }
      const configResult = validateVFSConfig(parsed);
      if (!configResult.ok)
        return configResult;
      vfsConfig = configResult.value;
    } catch (err) {
      if (err.code === ERRNO.ENOENT) {
        vfsConfig = { agents: [], skills: [], allowed: [], blocked: [] };
      } else {
        return {
          ok: false,
          error: {
            code: ERR.PARSE_ERROR,
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
      allowed: this.context.vfsConfig.allowed,
      blocked: this.context.vfsConfig.blocked,
      mode: this.context.mode
    });
  }
  /** Resolve an agent by name from configured agents directories. */
  async resolveAgent(name) {
    return resolveResource(name, this.context.vfsConfig.agents, this.#securityOptions);
  }
  /** Resolve a skill by name as a directory containing SKILL.md. */
  async resolveSkill(name) {
    return resolveSkillResource(name, this.context.vfsConfig.skills, this.#securityOptions);
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
  async listFiles(depthLimit) {
    return listMarkdownFiles(this.#securityOptions, depthLimit);
  }
  /** Enumerate vault folders up to the given depth. */
  async listFolders(depthLimit) {
    return listFolders(this.#securityOptions, depthLimit);
  }
  /** Get file or directory metadata. */
  async stat(virtualPath) {
    return statVirtualFile(virtualPath, this.#securityOptions);
  }
  /** Enumerate all skills from configured skills directories with deduplication. */
  async listSkills() {
    const { skills } = this.context.vfsConfig;
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const dir of skills) {
      const entries = await this.readDirectory(dir);
      if (!entries.ok)
        continue;
      for (const [name, type] of entries.value) {
        if (type !== "directory" || seen.has(name) || !SAFE_RESOURCE_NAME_RE.test(name))
          continue;
        seen.add(name);
        const skillPath = path8.join(dir, name, SKILL_FILENAME2);
        const content = await this.readFile(skillPath);
        if (!content.ok)
          continue;
        const description = extractFrontmatterDescription(content.value) ?? `Obsidian vault skill: ${name}`;
        result.push({ name, description, vaultRelativePath: skillPath });
      }
    }
    return { ok: true, value: result };
  }
  /** Enumerate all agents from configured agents directories with deduplication. */
  async listAgents() {
    const { agents } = this.context.vfsConfig;
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const dir of agents) {
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
        const agentPath = path8.join(dir, fileName);
        const content = await this.readFile(agentPath);
        if (!content.ok)
          continue;
        const description = extractFrontmatterDescription(content.value) ?? `Obsidian vault agent: ${name}`;
        result.push({ name, description, vaultRelativePath: agentPath });
      }
    }
    return { ok: true, value: result };
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

// ../core/dist/markdown-links.js
var FENCED_CODE_REGEX = /^(`{3,}|~{3,}).*$\n[\s\S]*?^(\1)[ \t]*$/gm;
var INLINE_CODE_REGEX = /`[^`]+`/g;
function maskRegion(text, start, end) {
  return text.slice(0, start) + " ".repeat(end - start) + text.slice(end);
}
function maskCodeRegions(text) {
  let masked = text;
  for (const m of text.matchAll(FENCED_CODE_REGEX)) {
    masked = maskRegion(masked, m.index, m.index + m[0].length);
  }
  for (const m of masked.matchAll(INLINE_CODE_REGEX)) {
    masked = maskRegion(masked, m.index, m.index + m[0].length);
  }
  return masked;
}

// src/context-formatter.ts
var BLOCK_SEPARATOR = "\n\n";
function formatHeader(raw, targetType, resolvedPath, absolutePath, section) {
  const sectionPart = section !== void 0 ? `, section: ${section}` : "";
  return `--- ${raw} (${targetType}, ${resolvedPath}, path: "${absolutePath}"${sectionPart}) ---`;
}
function formatResolved(mention) {
  const header = formatHeader(
    mention.mention.raw,
    mention.targetType,
    mention.resolvedPath,
    mention.absolutePath,
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

// src/proxy-detector.ts
import { readFile as readFile2 } from "node:fs/promises";
import { join } from "node:path";
var OBS_READ_PATTERN = /inspect\s+--body\s+"(\/obs:[^"]+)"/;
async function detectProxy(commandName, cwd) {
  const skillsRoot = join(cwd, ".claude", "skills");
  const relative = join(commandName, "SKILL.md");
  if (!canonicalizePath(relative, skillsRoot).ok) return null;
  const skillPath = join(skillsRoot, relative);
  let content;
  try {
    content = await readFile2(skillPath, "utf8");
  } catch {
    return null;
  }
  const match = OBS_READ_PATTERN.exec(content);
  if (match === null) return null;
  const obsMention = match[1];
  const skillName = obsMention.slice("/obs:".length);
  return { isProxy: true, skillName, obsMention };
}

// src/types.ts
import { join as join2 } from "node:path";
function toAbsolutePath(tracker, relativePath) {
  return join2(tracker.context.physicalPath, relativePath);
}

// src/uri-extractor.ts
var OBS_URI_PATTERN = new RegExp(`${URI_PREFIX.replace("//", "\\/{2}")}[^\\s\\]>]+`, "g");
function trimTrailingParens(raw) {
  let uri = raw;
  while (uri.endsWith(")") && (uri.match(/\(/g) ?? []).length < (uri.match(/\)/g) ?? []).length) {
    uri = uri.slice(0, -1);
  }
  return uri;
}
function extractObsUris(text) {
  const masked = maskCodeRegions(text);
  const seen = /* @__PURE__ */ new Map();
  const regex = new RegExp(OBS_URI_PATTERN.source, OBS_URI_PATTERN.flags);
  let match;
  while ((match = regex.exec(masked)) !== null) {
    const uri = trimTrailingParens(match[0]);
    const parsed = parseObsUri(uri);
    if (!parsed.ok) continue;
    const key = `${parsed.value.vaultName}/${parsed.value.path}${parsed.value.section !== void 0 ? `#${parsed.value.section}` : ""}`;
    if (!seen.has(key)) {
      seen.set(key, {
        uri,
        vaultName: parsed.value.vaultName,
        path: parsed.value.path,
        section: parsed.value.section
      });
    }
  }
  return [...seen.values()];
}

// src/ref-resolver.ts
function buildMention(path9, section) {
  const sectionPart = section !== void 0 ? `#${section}` : "";
  return `${MENTION_PREFIX}${path9}${sectionPart}`;
}
async function resolveObsUriReferences(content, tracker) {
  const uris = extractObsUris(content);
  if (uris.length === 0) return [];
  const results = await Promise.all(
    uris.map(async (uri) => {
      const mention = buildMention(uri.path, uri.section);
      const fakeExtracted = {
        kind: "context",
        raw: uri.uri,
        reference: uri.path + (uri.section !== void 0 ? `#${uri.section}` : ""),
        startIndex: 0,
        endIndex: 0
      };
      const result = await resolveMention(mention, tracker);
      if (result.ok) {
        return {
          status: "resolved",
          mention: fakeExtracted,
          targetType: result.value.targetType,
          resolvedPath: result.value.resolvedPath,
          absolutePath: toAbsolutePath(tracker, result.value.resolvedPath),
          section: result.value.section,
          content: result.value.content
        };
      }
      return { status: "error", mention: fakeExtracted, errorMessage: result.error.message };
    })
  );
  return results;
}

// src/expansion-handler.ts
function parseExpansionInput(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed;
  if (obj.hook_event_name !== "UserPromptExpansion") return null;
  if (typeof obj.session_id !== "string") return null;
  if (typeof obj.transcript_path !== "string") return null;
  if (typeof obj.cwd !== "string") return null;
  if (typeof obj.command_name !== "string") return null;
  return obj;
}
async function handleExpansion(input) {
  const detection = await detectProxy(input.command_name, input.cwd);
  if (detection === null) return {};
  const config = resolveExecConfig(process.env);
  const boot = await bootstrapTracker(config);
  if (!boot.ok) {
    return {
      hookSpecificOutput: {
        hookEventName: "UserPromptExpansion",
        additionalContext: `[obs: ${detection.obsMention} -- Error: ${boot.error.message}]`
      }
    };
  }
  const skillResult = await resolveSkillMention(
    SKILL_PREFIX + detection.skillName,
    boot.value.tracker
  );
  if (!skillResult.ok) {
    return {
      hookSpecificOutput: {
        hookEventName: "UserPromptExpansion",
        additionalContext: `[obs: ${detection.obsMention} -- Error: ${skillResult.error.message}]`
      }
    };
  }
  const refs = await resolveObsUriReferences(skillResult.value.content, boot.value.tracker);
  if (refs.length === 0) return {};
  const context = formatContext(refs);
  if (context === "") return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptExpansion",
      additionalContext: context
    }
  };
}

// src/stdin-runner.ts
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function runHookEntry(name, parse, handle) {
  const task = async () => {
    const raw = await readStdin();
    const input = parse(raw);
    if (input === null) {
      process.stdout.write("{}\n");
      return;
    }
    const output = await handle(input);
    process.stdout.write(JSON.stringify(output) + "\n");
  };
  task().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`obsidian-vfs ${name} error: ${message}
`);
    process.stdout.write("{}\n");
  });
}

// src/entry-expansion.ts
runHookEntry("expansion handler", parseExpansionInput, handleExpansion);
