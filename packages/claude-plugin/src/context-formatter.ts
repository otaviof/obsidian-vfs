import type { ResolvedMention } from "./types.js";

/** Separator between mention blocks in the additionalContext string. */
const BLOCK_SEPARATOR = "\n\n";

/** Build the header line for a resolved mention block. */
function formatHeader(
  raw: string,
  targetType: string,
  resolvedPath: string,
  section: string | undefined,
): string {
  const sectionPart = section !== undefined ? `, section: ${section}` : "";
  return `--- ${raw} (${targetType}, ${resolvedPath}${sectionPart}) ---`;
}

/** Format a successfully resolved mention as a content block. */
function formatResolved(mention: ResolvedMention & { status: "resolved" }): string {
  const header = formatHeader(
    mention.mention.raw,
    mention.targetType,
    mention.resolvedPath,
    mention.section,
  );
  return `${header}\n${mention.content}`;
}

/** Format a failed mention as an error block. */
function formatError(mention: ResolvedMention & { status: "error" }): string {
  return `[obs: ${mention.mention.raw} -- Error: ${mention.errorMessage}]`;
}

/** Build the final additionalContext string from resolved mentions. */
export function formatContext(mentions: readonly ResolvedMention[]): string {
  if (mentions.length === 0) return "";

  const blocks = mentions.map((m) => {
    if (m.status === "resolved") return formatResolved(m);
    return formatError(m);
  });

  return blocks.join(BLOCK_SEPARATOR);
}
