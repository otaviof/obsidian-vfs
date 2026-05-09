import { resolveExecConfig } from "@obsidian-vfs/core";
import { resolveSkillMention as coreResolveSkillMention, SKILL_PREFIX } from "@obsidian-vfs/core";

import { bootstrapTracker } from "./bootstrap.js";
import { formatContext } from "./context-formatter.js";
import { detectProxy } from "./proxy-detector.js";
import { resolveObsUriReferences } from "./ref-resolver.js";

/** JSON input for the UserPromptExpansion hook. */
export interface ExpansionInput {
  readonly hook_event_name: "UserPromptExpansion";
  readonly session_id: string;
  readonly transcript_path: string;
  readonly cwd: string;
  readonly command_name: string;
  readonly expansion_type?: string;
  readonly command_args?: string;
  readonly command_source?: string;
  readonly prompt?: string;
}

/** JSON output for the UserPromptExpansion hook. */
export interface ExpansionOutput {
  readonly hookSpecificOutput?: {
    readonly hookEventName: "UserPromptExpansion";
    readonly additionalContext?: string;
  };
}

/** Parse stdin JSON into ExpansionInput, returning null on invalid input. */
export function parseExpansionInput(raw: string): ExpansionInput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  if (obj.hook_event_name !== "UserPromptExpansion") return null;
  if (typeof obj.session_id !== "string") return null;
  if (typeof obj.transcript_path !== "string") return null;
  if (typeof obj.cwd !== "string") return null;
  if (typeof obj.command_name !== "string") return null;

  return obj as unknown as ExpansionInput;
}

/** Handle a UserPromptExpansion event for vault-sourced skills. */
export async function handleExpansion(input: ExpansionInput): Promise<ExpansionOutput> {
  const detection = await detectProxy(input.command_name, input.cwd);
  if (detection === null) return {};

  const config = resolveExecConfig(process.env);
  const boot = await bootstrapTracker(config);
  if (!boot.ok) {
    return {
      hookSpecificOutput: {
        hookEventName: "UserPromptExpansion",
        additionalContext: `[obs: ${detection.obsMention} -- Error: ${boot.error.message}]`,
      },
    };
  }

  const skillResult = await coreResolveSkillMention(
    SKILL_PREFIX + detection.skillName,
    boot.value.tracker,
  );
  if (!skillResult.ok) {
    return {
      hookSpecificOutput: {
        hookEventName: "UserPromptExpansion",
        additionalContext: `[obs: ${detection.obsMention} -- Error: ${skillResult.error.message}]`,
      },
    };
  }

  const refs = await resolveObsUriReferences(skillResult.value.content, boot.value.tracker);
  if (refs.length === 0) return {};

  const context = formatContext(refs);
  if (context === "") return {};

  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptExpansion",
      additionalContext: context,
    },
  };
}
