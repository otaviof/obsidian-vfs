import {
  EXIT_ERROR,
  EXIT_SUCCESS,
  EXIT_USAGE,
  SKILL_PREFIX,
  normalizeMention,
  resolveMention,
  resolveExecConfig,
  resolveSkillMention,
} from "@obsidian-vfs/core";

import { bootstrapTracker } from "./bootstrap.js";

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
