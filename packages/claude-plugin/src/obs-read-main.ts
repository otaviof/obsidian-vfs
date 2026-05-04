import {
  MENTION_PREFIX,
  SKILL_PREFIX,
  resolveMention,
  resolveSkillMention,
  resolveExecConfig,
} from "@obsidian-vfs/core";

import { bootstrapTracker } from "./bootstrap.js";

/** Exit code for successful resolution. */
const EXIT_SUCCESS = 0;

/** Exit code for resolution or bootstrap failure. */
const EXIT_ERROR = 1;

/** Exit code for usage errors (missing argument). */
const EXIT_USAGE = 2;

/** Add the @obs: prefix if the user omitted it; preserve existing prefixes. */
function normalizeMention(input: string): string {
  if (input.startsWith(MENTION_PREFIX) || input.startsWith(SKILL_PREFIX)) {
    return input;
  }
  return MENTION_PREFIX + input;
}

/** Resolve a vault mention and write the content to stdout. */
export async function run(args: readonly string[]): Promise<number> {
  const reference = args[0];
  if (!reference) {
    process.stderr.write("Usage: obs-read <reference>\n");
    return EXIT_USAGE;
  }

  const mention = normalizeMention(reference);
  const config = resolveExecConfig(process.env);

  const boot = await bootstrapTracker(config);
  if (!boot.ok) {
    process.stderr.write(`obs-read: ${boot.error.message}\n`);
    return EXIT_ERROR;
  }

  const result = mention.startsWith(SKILL_PREFIX)
    ? await resolveSkillMention(mention, boot.value.tracker)
    : await resolveMention(mention, boot.value.tracker);

  if (!result.ok) {
    process.stderr.write(`obs-read: ${result.error.message}\n`);
    return EXIT_ERROR;
  }

  process.stdout.write(result.value.content);
  return EXIT_SUCCESS;
}
