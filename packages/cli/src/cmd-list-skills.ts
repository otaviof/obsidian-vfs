import type { ListSkillsArgs, ListSkillsOutput } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";
import { bootstrapTracker } from "./bootstrap.js";
import {
  formatError,
  formatListSkillsJSON,
  formatListSkillsResult,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";

/** Execute the list-skills command. */
export async function run(args: ListSkillsArgs): Promise<number> {
  const boot = await bootstrapTracker({ cliPath: args.cliPath, timeoutMs: args.timeoutMs });
  if (!boot.ok) {
    if (args.json) {
      writeStdout(JSON.stringify({ ok: false, error: boot.error }, null, 2));
    } else {
      writeStderr(formatError(boot.error));
    }
    return EXIT_ERROR;
  }

  const { tracker, initMs } = boot.value;
  const enumStart = performance.now();

  const skillsResult = await tracker.listSkills();
  if (!skillsResult.ok) {
    if (args.json) {
      writeStdout(JSON.stringify({ ok: false, error: skillsResult.error }, null, 2));
    } else {
      writeStderr(formatError(skillsResult.error));
    }
    return EXIT_ERROR;
  }

  const enumMs = performance.now() - enumStart;
  const skills = skillsResult.value;

  const output: ListSkillsOutput = {
    skills,
    count: skills.length,
  };

  if (args.json) {
    writeStdout(formatListSkillsJSON(output));
  } else {
    writeStdout(formatListSkillsResult(output));
  }

  if (args.verbose) {
    writeStderr(formatVerboseTiming("Enumeration", enumMs));
    writeStderr(formatVerboseTiming("Init", initMs));
  }

  return EXIT_SUCCESS;
}
