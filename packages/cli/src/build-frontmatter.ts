import type { VFSResult } from "@obsidian-vfs/core";
import { mapModelToClaude } from "@obsidian-vfs/core";

/** Parsed frontmatter overrides from --set and --unset flags. */
export interface FrontmatterOverrides {
  readonly set: ReadonlyMap<string, string>;
  readonly unset: ReadonlySet<string>;
}

/** Options for the unified frontmatter builder. */
export interface BuildFrontmatterOptions {
  readonly name: string;
  readonly description: string;
  readonly sourceLines: readonly string[];
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

/** Extract the YAML key from a frontmatter line (text before the first `:`). */
function lineKey(line: string): string | undefined {
  const idx = line.indexOf(":");
  return idx > 0 ? line.slice(0, idx) : undefined;
}

/**
 * Build final frontmatter lines from vault source, resource metadata, and user overrides.
 */
export function buildFrontmatter(options: BuildFrontmatterOptions): string[] {
  const lines = [...options.sourceLines];

  // Step 1: model remap (agents path — skills already mapped by formatCuratedLines)
  if (options.remapModel) {
    for (let i = 0; i < lines.length; i++) {
      if (lineKey(lines[i]) === "model") {
        const value = lines[i].slice(lines[i].indexOf(":") + 1).trim();
        lines[i] = `model: ${mapModelToClaude(value)}`;
      }
    }
  }

  // Step 2: unset pass
  for (let i = lines.length - 1; i >= 0; i--) {
    const key = lineKey(lines[i]);
    if (key !== undefined && options.overrides.unset.has(key)) {
      lines.splice(i, 1);
    }
  }

  // Step 3: set pass (replace or append)
  for (const [key, value] of options.overrides.set) {
    const idx = lines.findIndex((l) => lineKey(l) === key);
    if (idx >= 0) {
      lines[idx] = `${key}: ${value}`;
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  // Step 4: ensure description default
  const hasDescription = lines.some((l) => lineKey(l) === "description");
  if (
    !hasDescription &&
    !options.overrides.unset.has("description") &&
    !options.overrides.set.has("description")
  ) {
    lines.unshift(`description: ${options.description}`);
  }

  // Step 5: ensure name (always — protected from overrides)
  const nameIdx = lines.findIndex((l) => lineKey(l) === "name");
  if (nameIdx >= 0) {
    lines[nameIdx] = `name: ${options.name}`;
  } else {
    lines.unshift(`name: ${options.name}`);
  }

  return lines;
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
