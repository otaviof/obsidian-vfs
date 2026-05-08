/** Claude model constant: lightweight/fast tier. */
export const CLAUDE_HAIKU = "haiku" as const;

/** Claude model constant: balanced mid-tier. */
export const CLAUDE_SONNET = "sonnet" as const;

/** Claude model constant: most capable tier. */
export const CLAUDE_OPUS = "opus" as const;

/** Default model used when no mapping rule matches. */
export const DEFAULT_MODEL = CLAUDE_SONNET;

/** Allowed Claude model identifiers for agent/skill provisioning. */
export type ClaudeModel = typeof CLAUDE_HAIKU | typeof CLAUDE_SONNET | typeof CLAUDE_OPUS;

/** Detects model names that are already Claude — returned unchanged. */
const CLAUDE_MODEL_RE = new RegExp(`${CLAUDE_HAIKU}|${CLAUDE_SONNET}|${CLAUDE_OPUS}`, "i");

interface MappingRule {
  readonly pattern: RegExp;
  readonly model: ClaudeModel;
}

/** Anchored rule table for non-Claude models. Every pattern uses ^ and $ for full-string matching. */
const RULES: readonly MappingRule[] = [
  { pattern: /^gemini-.*flash-lite.*$/i, model: CLAUDE_HAIKU },
  { pattern: /^gemini-.*flash.*$/i, model: CLAUDE_SONNET },
  { pattern: /^gemini-.*pro.*$/i, model: CLAUDE_SONNET },
  { pattern: /^gemini-.*ultra.*$/i, model: CLAUDE_OPUS },
  { pattern: /^gpt-4o$/i, model: CLAUDE_SONNET },
  { pattern: /^gpt-4o-mini.*$/i, model: CLAUDE_HAIKU },
  { pattern: /^gpt-4-turbo.*$/i, model: CLAUDE_SONNET },
  { pattern: /^gpt-4\.5.*$/i, model: CLAUDE_OPUS },
  { pattern: /^gpt-3\.5.*$/i, model: CLAUDE_HAIKU },
  { pattern: /^o1.*$/i, model: CLAUDE_OPUS },
  { pattern: /^o3.*$/i, model: CLAUDE_OPUS },
];

/** Map an arbitrary model name to the closest Claude equivalent. Claude names pass through unchanged. */
export function mapModelToClaude(model: string): string {
  const input = model.toLowerCase();
  if (CLAUDE_MODEL_RE.test(input)) return model;
  for (const { pattern, model: mapped } of RULES) {
    if (pattern.test(input)) return mapped;
  }
  return DEFAULT_MODEL;
}
