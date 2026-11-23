import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { URI_SCHEMES, canonicalizePath } from "@obsidian-vfs/core";

/** Result of detecting a vault-sourced proxy skill. */
export interface ProxyDetection {
  readonly isProxy: true;
  readonly skillName: string;
  readonly obsMention: string;
}

/** Pattern matching the obs-read command in a proxy SKILL.md (any accepted scheme). */
const OBS_READ_PATTERN = new RegExp(
  `inspect\\s+--body\\s+"(\\/(?:${URI_SCHEMES.join("|")}):[^"]+)"`,
);

/** Check if command_name maps to a vault proxy SKILL.md under cwd. */
export async function detectProxy(commandName: string, cwd: string): Promise<ProxyDetection | null> {
  const skillsRoot = join(cwd, ".claude", "skills");
  const relative = join(commandName, "SKILL.md");
  if (!canonicalizePath(relative, skillsRoot).ok) return null;

  const skillPath = join(skillsRoot, relative);
  let content: string;
  try {
    content = await readFile(skillPath, "utf8");
  } catch {
    return null;
  }

  const match = OBS_READ_PATTERN.exec(content);
  if (match === null) return null;

  const obsMention = match[1];
  const skillName = obsMention.slice(obsMention.indexOf(":") + 1);

  return { isProxy: true, skillName, obsMention };
}
