import { URI_SCHEMES, maskCodeRegions } from "@obsidian-vfs/core";

import type { ExtractedMention } from "./types.js";

/** Pattern matching `@obs:`/`@vault:` and `/obs:`/`/vault:` mentions — captures prefix and reference. */
const MENTION_PATTERN = new RegExp(`([@/])(?:${URI_SCHEMES.join("|")}):([^\\s]+)`, "g");

/** Trailing punctuation to strip from mention references. */
const TRAILING_PUNCT = /[,.)!?;:]+$/;

/** Extract all `@obs:` and `/obs:` mentions from a prompt, ignoring code blocks. */
export function extractMentions(prompt: string): readonly ExtractedMention[] {
  const masked = maskCodeRegions(prompt);
  const seen = new Map<string, ExtractedMention>();

  const regex = new RegExp(MENTION_PATTERN.source, MENTION_PATTERN.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(masked)) !== null) {
    const prefix = match[1];
    let raw = match[0];
    let reference = match[2];

    raw = raw.replace(TRAILING_PUNCT, "");
    reference = reference.replace(TRAILING_PUNCT, "");

    if (reference === "") continue;

    const kind: "context" | "skill" = prefix === "/" ? "skill" : "context";

    if (!seen.has(raw)) {
      seen.set(raw, {
        kind,
        raw,
        reference,
        startIndex: match.index,
        endIndex: match.index + raw.length,
      });
    }
  }

  return [...seen.values()].sort((a, b) => a.startIndex - b.startIndex);
}
