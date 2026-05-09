import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DiscoveredResource } from "@obsidian-vfs/core";
import { extractCuratedFrontmatter, formatCuratedLines, SKILL_PREFIX } from "@obsidian-vfs/core";

import type { ProvisionArgs } from "./types.js";
import type { ProvisionStrategy } from "./cmd-provision-resources.js";
import {
  CLAUDE_DIR,
  countPermissionRule,
  readCommand,
  run as runProvision,
  syncPermissionRule,
} from "./cmd-provision-resources.js";

/** Build the proxy SKILL.md content string for a given skill with curated frontmatter. */
function buildProxyContent(
  skill: DiscoveredResource,
  curated: readonly string[],
  pin: boolean,
): string {
  const cmd = readCommand(pin);
  const lines = [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    ...curated,
    "---",
    "",
    `!\`${cmd} "${SKILL_PREFIX}${skill.name}"\``,
    "",
  ];
  return lines.join("\n");
}

/** Write a single proxy SKILL.md file, creating the directory if needed. */
async function writeProxySkill(
  skill: DiscoveredResource,
  curated: readonly string[],
  skillsDir: string,
  pin: boolean,
): Promise<"written" | "unchanged"> {
  const dir = path.join(skillsDir, skill.name);
  const filePath = path.join(dir, "SKILL.md");
  const content = buildProxyContent(skill, curated, pin);

  try {
    const existing = await readFile(filePath, "utf-8");
    if (existing === content) return "unchanged";
  } catch {
    // File doesn't exist yet
  }

  await mkdir(dir, { recursive: true });
  await writeFile(filePath, content, "utf-8");
  return "written";
}

/** Execute the provision-skills command. */
export async function run(args: ProvisionArgs): Promise<number> {
  const skillStrategy: ProvisionStrategy = {
    resourceKind: "skills",
    outputDir: path.join(CLAUDE_DIR, "skills"),
    enumerate: (tracker) => tracker.listSkills(),
    writeProxy: async (resource, tracker, outputDir) => {
      const source = await tracker.readFile(resource.vaultRelativePath);
      const curated = source.ok ? formatCuratedLines(extractCuratedFrontmatter(source.value)) : [];
      return writeProxySkill(resource, curated, outputDir, args.pin);
    },
    syncPermissions: (settingsPath) => syncPermissionRule(settingsPath, args.pin),
    countPermissions: (settingsPath) => countPermissionRule(settingsPath, args.pin),
  };
  return runProvision(args, skillStrategy);
}
