/** Pattern matching fenced code blocks (``` delimited, with optional language tag). */
const FENCED_CODE_BLOCK = /```[\s\S]*?```/g;

/** Pattern matching inline code spans (` delimited). */
const INLINE_CODE = /`[^`]+`/g;

/** Replace matched regions with space characters, preserving string length. */
function replaceWithSpaces(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => " ".repeat(match.length));
}

/** Mask fenced code blocks and inline code spans to prevent false matches. */
export function maskCodeRegions(text: string): string {
  let masked = replaceWithSpaces(text, FENCED_CODE_BLOCK);
  masked = replaceWithSpaces(masked, INLINE_CODE);
  return masked;
}
