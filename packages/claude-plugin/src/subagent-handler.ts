import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { resolveExecConfig } from "@obsidian-vfs/core";

import { bootstrapTracker } from "./bootstrap.js";
import { formatContext } from "./context-formatter.js";
import { resolveObsUriReferences } from "./ref-resolver.js";
import { extractObsUris } from "./uri-extractor.js";

/** JSON input for the SubagentStart hook. */
export interface SubagentInput {
  readonly hook_event_name: "SubagentStart";
  readonly session_id: string;
  readonly transcript_path: string;
  readonly cwd: string;
  readonly agent_type: string;
  readonly agent_id?: string;
}

/** JSON output for the SubagentStart hook. */
export interface SubagentOutput {
  readonly hookSpecificOutput?: {
    readonly hookEventName: "SubagentStart";
    readonly additionalContext?: string;
  };
}

/** Parse stdin JSON into SubagentInput, returning null on invalid input. */
export function parseSubagentInput(raw: string): SubagentInput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  if (obj.hook_event_name !== "SubagentStart") return null;
  if (typeof obj.session_id !== "string") return null;
  if (typeof obj.transcript_path !== "string") return null;
  if (typeof obj.cwd !== "string") return null;
  if (typeof obj.agent_type !== "string") return null;

  return obj as unknown as SubagentInput;
}

/** Handle a SubagentStart event for provisioned agents with obs:// URIs. */
export async function handleSubagentStart(input: SubagentInput): Promise<SubagentOutput> {
  const agentsRoot = join(input.cwd, ".claude", "agents");
  const agentPath = join(agentsRoot, `${input.agent_type}.md`);
  if (!resolve(agentPath).startsWith(resolve(agentsRoot) + "/")) return {};

  let content: string;
  try {
    content = await readFile(agentPath, "utf8");
  } catch {
    return {};
  }

  const uris = extractObsUris(content);
  if (uris.length === 0) return {};

  const config = resolveExecConfig(process.env);
  const boot = await bootstrapTracker(config);
  if (!boot.ok) {
    const errorBlocks = uris.map((u) => `[obs: ${u.uri} -- Error: ${boot.error.message}]`);
    return {
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: errorBlocks.join("\n\n"),
      },
    };
  }

  const refs = await resolveObsUriReferences(content, boot.value.tracker);
  if (refs.length === 0) return {};

  const context = formatContext(refs);
  if (context === "") return {};

  return {
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: context,
    },
  };
}
