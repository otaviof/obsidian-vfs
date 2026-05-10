import type { VFSResult } from "@obsidian-vfs/core";
import { mapModelToClaude } from "@obsidian-vfs/core";
import YAML from "yaml";

/** Parsed frontmatter overrides from --set and --unset flags. */
export interface FrontmatterOverrides {
  readonly set: ReadonlyMap<string, string>;
  readonly unset: ReadonlySet<string>;
}

/** Options for the unified frontmatter builder. */
export interface BuildFrontmatterOptions {
  readonly name: string;
  readonly description: string;
  /** Parsed YAML frontmatter from vault source. */
  readonly source: Readonly<Record<string, unknown>>;
  readonly remapModel: boolean;
  readonly overrides: FrontmatterOverrides;
}

/** Empty overrides constant for default/no-override cases. */
export const NO_OVERRIDES: FrontmatterOverrides = Object.freeze({
  set: new Map<string, string>(),
  unset: new Set<string>(),
});

const PROTECTED_KEYS = new Set(["name"]);

/**
 * Parse --set key=value pairs and --unset keys into a FrontmatterOverrides record.
 */
export function parseFrontmatterOverrides(
  setPairs: readonly string[],
  unsetKeys: readonly string[],
): VFSResult<FrontmatterOverrides> {
  if (setPairs.length === 0 && unsetKeys.length === 0) {
    return { ok: true, value: NO_OVERRIDES };
  }

  const setMap = new Map<string, string>();
  for (const pair of setPairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: `Invalid --set value "${pair}": missing '='` },
      };
    }
    const key = pair.slice(0, eqIdx);
    const value = pair.slice(eqIdx + 1);
    if (key === "") {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: `Invalid --set value "${pair}": empty key` },
      };
    }
    if (PROTECTED_KEYS.has(key)) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: `Cannot override protected key '${key}'` },
      };
    }
    if (value === "") {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: `Invalid --set value "${pair}": empty value` },
      };
    }
    setMap.set(key, value);
  }

  const unsetSet = new Set<string>();
  for (const key of unsetKeys) {
    if (key === "") {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: "Invalid --unset value: empty key" },
      };
    }
    if (PROTECTED_KEYS.has(key)) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: `Cannot unset protected key '${key}'` },
      };
    }
    unsetSet.add(key);
  }

  for (const key of setMap.keys()) {
    if (unsetSet.has(key)) {
      return {
        ok: false,
        error: {
          code: "PARSE_ERROR",
          message: `Key '${key}' appears in both --set and --unset`,
        },
      };
    }
  }

  return { ok: true, value: { set: setMap, unset: unsetSet } };
}

/** Frontmatter keys forwarded from vault source for skill proxies. */
const CURATED_KEYS = new Set(["model", "allowed-tools", "argument-hint"]);

/** Filter a parsed frontmatter Record to only curated skill keys. */
export function pickCuratedKeys(source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (CURATED_KEYS.has(key)) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Build final frontmatter from vault source, resource metadata, and user overrides.
 * Returns serialized YAML string (without --- fences). Caller wraps.
 */
export function buildFrontmatter(options: BuildFrontmatterOptions): string {
  const record: Record<string, unknown> = { ...options.source };

  if (options.remapModel && record.model !== undefined) {
    const raw = record.model;
    if (typeof raw === "string") {
      record.model = mapModelToClaude(raw);
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      record.model = mapModelToClaude(raw.toString());
    }
  }

  for (const key of options.overrides.unset) {
    delete record[key];
  }

  for (const [key, value] of options.overrides.set) {
    record[key] = value;
  }

  if (
    record.description === undefined &&
    !options.overrides.unset.has("description") &&
    !options.overrides.set.has("description")
  ) {
    record.description = options.description;
  }

  record.name = options.name;

  const ordered: Record<string, unknown> = { name: record.name };
  if (record.description !== undefined) {
    ordered.description = record.description;
  }
  for (const key of Object.keys(record)) {
    if (key !== "name" && key !== "description") {
      ordered[key] = record[key];
    }
  }

  return YAML.stringify(ordered, { lineWidth: 0 }).trimEnd();
}

/** Split markdown content into raw YAML frontmatter block and body. */
export function splitFrontmatterAndBody(content: string): {
  frontmatter: string | undefined;
  body: string;
} {
  if (!content.startsWith("---\n")) return { frontmatter: undefined, body: content };
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: undefined, body: content };
  return { frontmatter: content.slice(4, end), body: content.slice(end + 5) };
}
