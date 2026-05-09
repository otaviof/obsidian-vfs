import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Result of detecting a vault-sourced proxy skill. */
export interface ProxyDetection {
  readonly isProxy: true;
  readonly skillName: string;
  readonly obsMention: string;
}

/** Pattern matching the obs-read command in a proxy SKILL.md. */
const OBS_READ_PATTERN = /inspect\s+--body\s+"(\/obs:[^"]+)"/;

/** Check if command_name maps to a vault proxy SKILL.md under cwd. */
export async function detectProxy(commandName: string, cwd: string): Promise<ProxyDetection | null> {
  const skillsRoot = join(cwd, ".claude", "skills");
  const skillPath = join(skillsRoot, commandName, "SKILL.md");
  if (!resolve(skillPath).startsWith(resolve(skillsRoot) + "/")) return null;

  let content: string;
  try {
    content = await readFile(skillPath, "utf8");
  } catch {
    return null;
  }

  const match = OBS_READ_PATTERN.exec(content);
  if (match === null) return null;

  const obsMention = match[1];
  const skillName = obsMention.slice("/obs:".length);

  return { isProxy: true, skillName, obsMention };
}
