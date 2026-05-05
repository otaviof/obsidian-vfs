import { MENTION_PREFIX, SKILL_PREFIX } from "./resolve-mention.js";
import type { VFSResult } from "./types.js";

/** Result of parsing a single `[[wikilink]]` or `![[embed]]` in markdown text. */
export interface ParsedLink {
  readonly kind: "wikilink" | "embed";
  readonly target: string;
  readonly section?: string;
  readonly display?: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

/** Callback to resolve an embed target to its content. */
export type EmbedResolver = (target: string, section?: string) => Promise<VFSResult<string>>;

/** Matches fenced code blocks (``` or ~~~). */
const FENCED_CODE_REGEX = /^(`{3,}|~{3,}).*$\n[\s\S]*?^(\1)[ \t]*$/gm;

/** Matches inline code spans. */
const INLINE_CODE_REGEX = /`[^`]+`/g;

/** Matches `[[target#section|display]]` wikilink syntax. */
const LINK_REGEX = /\[\[([^\]|#]+)(?:#([^\]|]*))?\|?([^\]]*)\]\]/g;

/** Replace characters in a region with spaces, preserving positions. */
function maskRegion(text: string, start: number, end: number): string {
  return text.slice(0, start) + " ".repeat(end - start) + text.slice(end);
}

/** Mask fenced code blocks and inline code spans to prevent false link detection. */
function maskCodeRegions(text: string): string {
  let masked = text;
  for (const m of text.matchAll(FENCED_CODE_REGEX)) {
    masked = maskRegion(masked, m.index, m.index + m[0].length);
  }
  for (const m of masked.matchAll(INLINE_CODE_REGEX)) {
    masked = maskRegion(masked, m.index, m.index + m[0].length);
  }
  return masked;
}

/** Parse all `[[wikilink]]` and `![[embed]]` references from markdown text. */
export function parseMarkdownLinks(markdown: string): readonly ParsedLink[] {
  const masked = maskCodeRegions(markdown);
  const links: ParsedLink[] = [];

  for (const m of masked.matchAll(LINK_REGEX)) {
    const isEmbed = m.index > 0 && markdown[m.index - 1] === "!";
    const startIndex = isEmbed ? m.index - 1 : m.index;
    const endIndex = m.index + m[0].length;
    const section = m[2] && m[2].length > 0 ? m[2] : undefined;
    const display = m[3] && m[3].length > 0 ? m[3] : undefined;

    links.push({
      kind: isEmbed ? "embed" : "wikilink",
      target: m[1],
      section,
      display,
      startIndex,
      endIndex,
    });
  }

  return links;
}

/** Strip `[[brackets]]` and `|alias` from raw wikilink input. */
export function normalizeWikilink(input: string): string {
  let cleaned = input.trim();
  if (cleaned.startsWith("[[") && cleaned.endsWith("]]")) {
    cleaned = cleaned.slice(2, -2);
  }
  const pipeIndex = cleaned.indexOf("|");
  if (pipeIndex !== -1) {
    cleaned = cleaned.slice(0, pipeIndex);
  }
  return cleaned.trim();
}

/** Classify a raw reference string as mention, skill, or wikilink. */
export function classifyInput(raw: string): "mention" | "skill" | "wikilink" {
  if (raw.startsWith(MENTION_PREFIX)) return "mention";
  if (raw.startsWith(SKILL_PREFIX)) return "skill";
  return "wikilink";
}

/** Resolve `![[embed]]` references in markdown text (single-level, no recursion). */
export async function resolveEmbeds(
  markdown: string,
  resolver: EmbedResolver,
): Promise<VFSResult<string>> {
  const links = parseMarkdownLinks(markdown).filter((l) => l.kind === "embed");
  if (links.length === 0) return { ok: true, value: markdown };

  let result = markdown;
  let offset = 0;

  for (const link of links) {
    const resolved = await resolver(link.target, link.section);
    if (!resolved.ok) continue;

    const start = link.startIndex + offset;
    const end = link.endIndex + offset;
    const original = end - start;
    result = result.slice(0, start) + resolved.value + result.slice(end);
    offset += resolved.value.length - original;
  }

  return { ok: true, value: result };
}
