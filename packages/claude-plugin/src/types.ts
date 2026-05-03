import type { LocalIndexTracker } from "@obsidian-vfs/core";

/** JSON input received from Claude Code on stdin for the UserPromptSubmit hook. */
export interface HookInput {
  readonly hook_event_name: "UserPromptSubmit";
  readonly session_id: string;
  readonly transcript_path: string;
  readonly cwd: string;
  readonly prompt: string;
  readonly permission_mode?: string;
  readonly agent_id?: string;
  readonly agent_type?: string;
}

/** JSON output written to stdout for the UserPromptSubmit hook. */
export interface HookOutput {
  readonly hookSpecificOutput?: {
    readonly hookEventName: "UserPromptSubmit";
    readonly additionalContext?: string;
  };
}

/** A single `@obs:` or `/obs:` mention extracted from the user prompt. */
export interface ExtractedMention {
  readonly kind: "context" | "skill";
  readonly raw: string;
  readonly reference: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

/** The result of resolving a single @obs: mention. */
export type ResolvedMention =
  | {
      readonly status: "resolved";
      readonly mention: ExtractedMention;
      readonly targetType: "file" | "agent" | "skill";
      readonly resolvedPath: string;
      readonly section: string | undefined;
      readonly content: string;
    }
  | {
      readonly status: "error";
      readonly mention: ExtractedMention;
      readonly errorMessage: string;
    };

/** Successful bootstrap result with the tracker. */
export interface BootstrapResult {
  readonly tracker: LocalIndexTracker;
}
