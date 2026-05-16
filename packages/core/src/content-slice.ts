import { buildObsUri } from "./uri.js";
import { ERR } from "./types.js";
import type { VFSResult } from "./types.js";

/**
 * Options for the combined processContent function.
 */
export interface ContentSliceOptions {
  readonly section?: string;
  readonly scrubWikilinks?: boolean;
  readonly vaultName?: string;
}

/** Matches markdown headings (levels 1-6) capturing depth and text. */
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/;

/** Matches `[[Target]]` and `[[Target|Display]]` wikilink syntax globally. */
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Extract content under a specific heading up to the next heading of equal or lesser depth.
 */
export function sliceContent(markdown: string, heading: string): VFSResult<string> {
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
    error: { code: ERR.FILE_NOT_FOUND, message: `Section not found: ${heading}` },
  };
}

/**
 * Replace `[[wikilinks]]` with standard markdown links using `obs://` URIs.
 */
export function scrubWikilinks(markdown: string, vaultName: string): string {
  return markdown.replace(WIKILINK_REGEX, (_match, target: string, display?: string) => {
    const hashIndex = target.indexOf("#");
    const path = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const section = hashIndex >= 0 ? target.slice(hashIndex + 1) : undefined;
    const uri = buildObsUri({ vaultName, path, section });
    return `[${display ?? target}](${uri})`;
  });
}

/**
 * Apply slicing and/or scrubbing based on options.
 */
export function processContent(markdown: string, options: ContentSliceOptions): VFSResult<string> {
  let result = markdown;

  if (options.section !== undefined) {
    const sliced = sliceContent(result, options.section);
    if (!sliced.ok) return sliced;
    result = sliced.value;
  }

  if (options.scrubWikilinks) {
    if (options.vaultName === undefined) {
      return {
        ok: false,
        error: { code: ERR.INVALID_URI, message: "vaultName is required when scrubbing wikilinks" },
      };
    }
    result = scrubWikilinks(result, options.vaultName);
  }

  return { ok: true, value: result };
}
