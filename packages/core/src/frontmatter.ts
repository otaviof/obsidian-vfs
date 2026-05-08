import { mapModelToClaude } from "./model-mapping.js";

/** Curated frontmatter fields extracted from vault source (shared by agents and skills). */
export interface CuratedFrontmatter {
  readonly model?: string;
  readonly allowedTools?: string;
  readonly argumentHint?: string;
}

/** Pattern to extract `description:` from YAML frontmatter. */
export const DESCRIPTION_RE = /^description:\s*(.+)$/m;

/** Pattern to extract `model:` from YAML frontmatter. */
export const MODEL_LINE_RE = /^model:\s*(.+)$/m;

/** Pattern to extract `allowed-tools:` from YAML frontmatter. */
export const ALLOWED_TOOLS_RE = /^allowed-tools:\s*(.+)$/m;

/** Pattern to extract `argument-hint:` from YAML frontmatter. */
export const ARGUMENT_HINT_RE = /^argument-hint:\s*(.+)$/m;

/** Extract the raw YAML frontmatter block from markdown content, or `undefined`. */
export function extractFrontmatter(content: string): string | undefined {
  if (!content.startsWith("---\n")) return undefined;
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return undefined;
  return content.slice(4, end);
}

/** Extract a field value from YAML frontmatter by regex pattern, or `undefined`. */
export function extractFrontmatterField(content: string, pattern: RegExp): string | undefined {
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) return undefined;
  const match = pattern.exec(frontmatter);
  const value = match?.[1]?.trim();
  return value !== "" ? value : undefined;
}

/** Extract the `description` value from YAML frontmatter, or `undefined`. */
export function extractFrontmatterDescription(content: string): string | undefined {
  return extractFrontmatterField(content, DESCRIPTION_RE);
}

/** Extract curated skill fields (`model`, `allowed-tools`, `argument-hint`) from frontmatter. */
export function extractCuratedFrontmatter(content: string): CuratedFrontmatter {
  const model = extractFrontmatterField(content, MODEL_LINE_RE);
  const allowedTools = extractFrontmatterField(content, ALLOWED_TOOLS_RE);
  const argumentHint = extractFrontmatterField(content, ARGUMENT_HINT_RE);
  return {
    ...(model !== undefined && { model }),
    ...(allowedTools !== undefined && { allowedTools }),
    ...(argumentHint !== undefined && { argumentHint }),
  };
}

/** Format curated frontmatter fields as YAML lines (model mapped to Claude equivalent). */
export function formatCuratedLines(curated: CuratedFrontmatter): string[] {
  const lines: string[] = [];
  if (curated.model !== undefined) {
    lines.push(`model: ${mapModelToClaude(curated.model)}`);
  }
  if (curated.allowedTools !== undefined) {
    lines.push(`allowed-tools: ${curated.allowedTools}`);
  }
  if (curated.argumentHint !== undefined) {
    lines.push(`argument-hint: ${curated.argumentHint}`);
  }
  return lines;
}

/** Replace `model: <value>` in a raw frontmatter string with the mapped Claude equivalent. */
export function remapModelLine(frontmatter: string): string {
  return frontmatter.replace(MODEL_LINE_RE, (_match, value: string) => {
    return `model: ${mapModelToClaude(value.trim())}`;
  });
}
