import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DiscoveredResource } from "@obsidian-vfs/core";

import type { ProvisionArgs } from "./types.js";
import type { ProvisionStrategy } from "./cmd-provision-resources.js";
import { CLAUDE_DIR, run as runProvision } from "./cmd-provision-resources.js";

/** Relative path to the obs-read binary used in !command and permission rules. */
const OBS_READ_BIN = "./bin/obs-read";

/** Build the permission rule string for a single skill's !command. */
function buildPermissionRule(skillName: string): string {
  return `Bash(${OBS_READ_BIN} "/obs:${skillName}")`;
}

/** Build the proxy SKILL.md content string for a given skill. */
function buildProxyContent(skill: DiscoveredResource): string {
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    "---",
    "",
    `!\`${OBS_READ_BIN} "/obs:${skill.name}"\``,
    "",
  ].join("\n");
}

/** Write a single proxy SKILL.md file, creating the directory if needed. */
async function writeProxySkill(
  skill: DiscoveredResource,
  skillsDir: string,
): Promise<"written" | "unchanged"> {
  const dir = path.join(skillsDir, skill.name);
  const filePath = path.join(dir, "SKILL.md");
  const content = buildProxyContent(skill);

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

/** Add missing per-skill permission rules to .claude/settings.local.json. */
async function syncSettingsPermissions(
  settingsPath: string,
  activeSkills: readonly string[],
): Promise<{ added: number }> {
  let data: { permissions?: { allow?: string[] } };

  try {
    const raw = await readFile(settingsPath, "utf-8");
    data = JSON.parse(raw) as typeof data;
  } catch {
    data = {};
  }

  data.permissions ??= {};
  if (!Array.isArray(data.permissions.allow)) data.permissions.allow = [];

  const existing = new Set(data.permissions.allow);
  let added = 0;

  for (const name of activeSkills) {
    const rule = buildPermissionRule(name);
    if (!existing.has(rule)) {
      data.permissions.allow.push(rule);
      added++;
    }
  }

  if (added > 0) {
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }

  return { added };
}

/** Count how many permission rules would be added (read-only, for dry-run). */
async function countPermissionChanges(
  settingsPath: string,
  activeSkills: readonly string[],
): Promise<{ added: number }> {
  let allow: string[] = [];
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const data = JSON.parse(raw) as { permissions?: { allow?: string[] } };
    allow = Array.isArray(data.permissions?.allow) ? data.permissions.allow : [];
  } catch {
    // File missing or unparseable — all active skills would be new
  }

  const existing = new Set(allow);
  let added = 0;
  for (const name of activeSkills) {
    if (!existing.has(buildPermissionRule(name))) added++;
  }

  return { added };
}

/** Skill provisioning strategy. */
const skillStrategy: ProvisionStrategy = {
  resourceKind: "skills",
  outputDir: path.join(CLAUDE_DIR, "skills"),
  enumerate: (tracker) => tracker.listSkills(),
  writeProxy: (resource, _tracker, outputDir) => writeProxySkill(resource, outputDir),
  syncPermissions: syncSettingsPermissions,
  countPermissions: countPermissionChanges,
};

/** Execute the provision-skills command. */
export async function run(args: ProvisionArgs): Promise<number> {
  return runProvision(args, skillStrategy);
}
