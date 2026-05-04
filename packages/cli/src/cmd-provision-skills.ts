import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DiscoveredSkill } from "@obsidian-vfs/core";

import type { ProvisionSkillsArgs, ProvisionSkillsOutput } from "./types.js";
import { EXIT_ERROR, EXIT_SUCCESS } from "./types.js";
import { bootstrapTracker } from "./bootstrap.js";
import {
  formatError,
  formatProvisionSkillsJSON,
  formatProvisionSkillsResult,
  formatVerboseTiming,
  writeStderr,
  writeStdout,
} from "./formatters.js";

/** Directory under project root where proxy skills are generated. */
const PROXY_SKILLS_DIR = path.join(".claude", "skills");

/** Settings file path relative to project root. */
const SETTINGS_PATH = path.join(".claude", "settings.local.json");

/** Relative path to the obs-read binary used in !command and permission rules. */
const OBS_READ_BIN = "./bin/obs-read";

/** Build the permission rule string for a single skill's !command. */
function buildPermissionRule(skillName: string): string {
  return `Bash(${OBS_READ_BIN} "/obs:${skillName}")`;
}

/** Build the proxy SKILL.md content string for a given skill. */
function buildProxyContent(skill: DiscoveredSkill): string {
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
  skill: DiscoveredSkill,
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

/** Execute the provision-skills command. */
export async function run(args: ProvisionSkillsArgs): Promise<number> {
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
  const discovered = skillsResult.value;

  const cwd = process.cwd();
  const skillsDir = path.join(cwd, PROXY_SKILLS_DIR);
  const settingsPath = path.join(cwd, SETTINGS_PATH);

  const written: string[] = [];
  const errors: string[] = [];

  if (!args.dryRun) {
    for (const skill of discovered) {
      try {
        const status = await writeProxySkill(skill, skillsDir);
        if (status === "written") written.push(skill.name);
      } catch (err) {
        errors.push(`Failed to write proxy for ${skill.name}: ${(err as Error).message}`);
      }
    }
  } else {
    for (const skill of discovered) {
      written.push(skill.name);
    }
  }

  let permissionsAdded = 0;

  if (!args.dryRun) {
    try {
      const result = await syncSettingsPermissions(
        settingsPath,
        discovered.map((s) => s.name),
      );
      permissionsAdded = result.added;
    } catch (err) {
      errors.push(`Failed to sync permissions: ${(err as Error).message}`);
    }
  } else {
    try {
      const result = await countPermissionChanges(
        settingsPath,
        discovered.map((s) => s.name),
      );
      permissionsAdded = result.added;
    } catch {
      permissionsAdded = discovered.length;
    }
  }

  const output: ProvisionSkillsOutput = {
    written,
    permissionsAdded,
    dryRun: args.dryRun,
    errors,
  };

  if (args.json) {
    writeStdout(formatProvisionSkillsJSON(output));
  } else {
    writeStdout(formatProvisionSkillsResult(output));
  }

  if (args.verbose) {
    writeStderr(formatVerboseTiming("Enumeration", enumMs));
    writeStderr(formatVerboseTiming("Init", initMs));
  }

  return errors.length > 0 ? EXIT_ERROR : EXIT_SUCCESS;
}
