#!/usr/bin/env node

import {
  MENTION_PREFIX,
  SKILL_PREFIX,
  resolveMention,
  resolveSkillMention as coreResolveSkillMention,
} from "@obsidian-vfs/core";
import { resolveExecConfig } from "@obsidian-vfs/core";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import type { ExtractedMention, HookInput, HookOutput, ResolvedMention } from "./types.js";
import { extractMentions } from "./mention-extractor.js";
import { bootstrapTracker } from "./bootstrap.js";
import { formatContext } from "./context-formatter.js";
import { runHookEntry } from "./stdin-runner.js";

/** Parse stdin JSON into HookInput, returning null on invalid input. */
export function parseInput(raw: string): HookInput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  if (obj.hook_event_name !== "UserPromptSubmit") return null;
  if (typeof obj.prompt !== "string") return null;
  if (typeof obj.session_id !== "string") return null;
  if (typeof obj.transcript_path !== "string") return null;
  if (typeof obj.cwd !== "string") return null;

  return obj as unknown as HookInput;
}

/** Resolve a `/obs:` mention as a skill via the core pipeline. */
async function resolveSkillMention(
  mention: ExtractedMention,
  tracker: LocalIndexTracker,
): Promise<ResolvedMention> {
  const result = await coreResolveSkillMention(SKILL_PREFIX + mention.reference, tracker);
  if (result.ok) {
    return {
      status: "resolved",
      mention,
      targetType: result.value.targetType,
      resolvedPath: result.value.resolvedPath,
      section: result.value.section,
      content: result.value.content,
    };
  }
  return { status: "error", mention, errorMessage: result.error.message };
}

/** Resolve one ExtractedMention through the tracker. */
async function resolveSingleMention(
  mention: ExtractedMention,
  tracker: LocalIndexTracker,
): Promise<ResolvedMention> {
  if (mention.kind === "skill") {
    return resolveSkillMention(mention, tracker);
  }

  const fullMention = MENTION_PREFIX + mention.reference;
  const result = await resolveMention(fullMention, tracker);

  if (result.ok) {
    return {
      status: "resolved",
      mention,
      targetType: result.value.targetType,
      resolvedPath: result.value.resolvedPath,
      section: result.value.section,
      content: result.value.content,
    };
  }

  return {
    status: "error",
    mention,
    errorMessage: result.error.message,
  };
}

/** Handle a UserPromptSubmit event: extract mentions, resolve, return context. */
export async function handlePromptSubmit(input: HookInput): Promise<HookOutput> {
  const mentions = extractMentions(input.prompt);
  if (mentions.length === 0) return {};

  const config = resolveExecConfig(process.env);

  const boot = await bootstrapTracker(config);
  if (!boot.ok) {
    const errorBlocks = mentions.map((m) => `[obs: ${m.raw} -- Error: ${boot.error.message}]`);
    return {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: errorBlocks.join("\n\n"),
      },
    };
  }

  const resolved = await Promise.all(
    mentions.map((m) => resolveSingleMention(m, boot.value.tracker)),
  );

  const context = formatContext(resolved);
  if (context === "") return {};

  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context,
    },
  };
}

runHookEntry("plugin", parseInput, handlePromptSubmit);
