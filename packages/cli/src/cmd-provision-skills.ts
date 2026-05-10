import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { extractFrontmatter, SKILL_PREFIX } from "@obsidian-vfs/core";
import YAML from "yaml";

import type { ProvisionArgs } from "./types.js";
import { EXIT_USAGE } from "./types.js";
import type { ProvisionStrategy } from "./cmd-provision-resources.js";
import {
  countPermissionRule,
  provisionPaths,
  readCommand,
  run as runProvision,
  syncPermissionRule,
} from "./cmd-provision-resources.js";
import {
  buildFrontmatter,
  parseFrontmatterOverrides,
  pickCuratedKeys,
} from "./build-frontmatter.js";
import { formatUsageError, writeStderr } from "./formatters.js";

/** Build the proxy SKILL.md content string from final frontmatter YAML. */
function buildProxyContent(frontmatter: string, skillName: string, pin: boolean): string {
  const cmd = readCommand(pin);
  return `---\n${frontmatter}\n---\n\n!\`${cmd} "${SKILL_PREFIX}${skillName}"\`\n`;
}

/** Write a single proxy SKILL.md file, creating the directory if needed. */
async function writeProxySkill(
  content: string,
  skillName: string,
  skillsDir: string,
): Promise<"written" | "unchanged"> {
  const dir = path.join(skillsDir, skillName);
  const filePath = path.join(dir, "SKILL.md");

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
  const overridesResult = parseFrontmatterOverrides(args.set, args.unset);
  if (!overridesResult.ok) {
    writeStderr(formatUsageError(overridesResult.error.message));
    return EXIT_USAGE;
  }
  const overrides = overridesResult.value;

  const { baseDir, settingsPath } = provisionPaths(args.user);

  const skillStrategy: ProvisionStrategy = {
    resourceKind: "skills",
    outputDir: path.join(baseDir, "skills"),
    settingsPath,
    enumerate: (tracker) => tracker.listSkills(),
    writeProxy: async (resource, tracker, outputDir) => {
      const raw = await tracker.readFile(resource.vaultRelativePath);
      const parsed = raw.ok
        ? pickCuratedKeys(
            (YAML.parse(extractFrontmatter(raw.value) ?? "") ?? {}) as Record<string, unknown>,
          )
        : {};
      const frontmatter = buildFrontmatter({
        name: resource.name,
        description: resource.description,
        source: parsed,
        remapModel: true,
        overrides,
      });
      const content = buildProxyContent(frontmatter, resource.name, args.pin);
      return writeProxySkill(content, resource.name, outputDir);
    },
    syncPermissions: (settingsPath) => syncPermissionRule(settingsPath, args.pin),
    countPermissions: (settingsPath) => countPermissionRule(settingsPath, args.pin),
  };
  return runProvision(args, skillStrategy);
}
