import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DiscoveredResource } from "@obsidian-vfs/core";
import { extractCuratedFrontmatter, formatCuratedLines, SKILL_PREFIX } from "@obsidian-vfs/core";

import type { ProvisionArgs } from "./types.js";
import type { ProvisionStrategy } from "./cmd-provision-resources.js";
import {
  CLAUDE_DIR,
  CLI_VERSION,
  countPermissionRule,
  readCommand,
  run as runProvision,
  syncPermissionRule,
} from "./cmd-provision-resources.js";

/** Build the proxy SKILL.md content string for a given skill with curated frontmatter. */
function buildProxyContent(skill: DiscoveredResource, curated: readonly string[]): string {
  const cmd = readCommand(CLI_VERSION);
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
): Promise<"written" | "unchanged"> {
  const dir = path.join(skillsDir, skill.name);
  const filePath = path.join(dir, "SKILL.md");
  const content = buildProxyContent(skill, curated);

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

/** Skill provisioning strategy. */
const skillStrategy: ProvisionStrategy = {
  resourceKind: "skills",
  outputDir: path.join(CLAUDE_DIR, "skills"),
  enumerate: (tracker) => tracker.listSkills(),
  writeProxy: async (resource, tracker, outputDir) => {
    const source = await tracker.readFile(resource.vaultRelativePath);
    const curated = source.ok ? formatCuratedLines(extractCuratedFrontmatter(source.value)) : [];
    return writeProxySkill(resource, curated, outputDir);
  },
  syncPermissions: (settingsPath) => syncPermissionRule(settingsPath, CLI_VERSION),
  countPermissions: (settingsPath) => countPermissionRule(settingsPath, CLI_VERSION),
};

/** Execute the provision-skills command. */
export async function run(args: ProvisionArgs): Promise<number> {
  return runProvision(args, skillStrategy);
}
