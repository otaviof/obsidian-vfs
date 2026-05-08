import { URI_SCHEME } from "@obsidian-vfs/core";

import type { ExtractedMention } from "./types.js";

/** Pattern matching fenced code blocks (``` delimited, with optional language tag). */
const FENCED_CODE_BLOCK = /```[\s\S]*?```/g;

/** Pattern matching inline code spans (` delimited). */
const INLINE_CODE = /`[^`]+`/g;

/** Pattern matching `@obs:` and `/obs:` mentions — captures prefix and reference. */
const MENTION_PATTERN = new RegExp(`([@/])${URI_SCHEME}:([^\\s]+)`, "g");

/** Trailing punctuation to strip from mention references. */
const TRAILING_PUNCT = /[,.)!?;:]+$/;

/** Replace matched regions with space characters, preserving string length. */
function replaceWithSpaces(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => " ".repeat(match.length));
}

/** Mask fenced code blocks and inline code spans to prevent false mention matches. */
function maskCodeRegions(text: string): string {
  let masked = replaceWithSpaces(text, FENCED_CODE_BLOCK);
  masked = replaceWithSpaces(masked, INLINE_CODE);
  return masked;
}

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
