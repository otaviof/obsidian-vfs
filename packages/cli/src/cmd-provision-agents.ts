import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { scrubWikilinks } from "@obsidian-vfs/core";

import type { ProvisionArgs } from "./types.js";
import type { ProvisionStrategy } from "./cmd-provision-resources.js";
import { CLAUDE_DIR, run as runProvision } from "./cmd-provision-resources.js";

/** Global permission rule for obs-read runtime usage. */
const OBS_READ_GLOBAL_RULE = "Bash(obs-read *)";

/** Regex to match a `name:` line in YAML frontmatter. */
const NAME_LINE_RE = /^name:\s*.+$/m;

/** Split markdown content into raw frontmatter block and body. */
function splitFrontmatterAndBody(content: string): {
  frontmatter: string | undefined;
  body: string;
} {
  if (!content.startsWith("---\n")) return { frontmatter: undefined, body: content };
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: undefined, body: content };
  return { frontmatter: content.slice(4, end), body: content.slice(end + 5) };
}

/** Ensure `name:` is present in frontmatter, replacing any existing value. */
function ensureNameInFrontmatter(frontmatter: string, name: string): string {
  if (NAME_LINE_RE.test(frontmatter)) {
    return frontmatter.replace(NAME_LINE_RE, `name: ${name}`);
  }
  return `name: ${name}\n${frontmatter}`;
}

/** Build the proxy agent content from vault source. */
function buildProxyContent(
  name: string,
  description: string,
  content: string,
  vaultName: string,
): string {
  const { frontmatter, body } = splitFrontmatterAndBody(content);
  const scrubbedBody = scrubWikilinks(body, vaultName);

  if (frontmatter) {
    const fm = ensureNameInFrontmatter(frontmatter, name);
    return `---\n${fm}\n---\n${scrubbedBody}`;
  }

  return ["---", `name: ${name}`, `description: ${description}`, "---", "", scrubbedBody].join("\n");
}

/** Write a single proxy agent file, creating the directory if needed. */
async function writeProxyAgent(
  name: string,
  proxyContent: string,
  agentsDir: string,
): Promise<"written" | "unchanged"> {
  const filePath = path.join(agentsDir, `${name}.md`);

  try {
    const existing = await readFile(filePath, "utf-8");
    if (existing === proxyContent) return "unchanged";
  } catch {
    // File doesn't exist yet
  }

  await mkdir(agentsDir, { recursive: true });
  await writeFile(filePath, proxyContent, "utf-8");
  return "written";
}

/** Ensure the global obs-read permission rule exists. Returns how many were added (0 or 1). */
async function ensureObsReadPermission(settingsPath: string): Promise<{ added: number }> {
  let data: { permissions?: { allow?: string[] } };

  try {
    const raw = await readFile(settingsPath, "utf-8");
    data = JSON.parse(raw) as typeof data;
  } catch {
    data = {};
  }

  data.permissions ??= {};
  if (!Array.isArray(data.permissions.allow)) data.permissions.allow = [];

  if (data.permissions.allow.includes(OBS_READ_GLOBAL_RULE)) {
    return { added: 0 };
  }

  data.permissions.allow.push(OBS_READ_GLOBAL_RULE);
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return { added: 1 };
}

/** Check whether the global obs-read permission rule would be added (read-only, for dry-run). */
async function countObsReadPermission(settingsPath: string): Promise<{ added: number }> {
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const data = JSON.parse(raw) as { permissions?: { allow?: string[] } };
    const allow = Array.isArray(data.permissions?.allow) ? data.permissions.allow : [];
    return { added: allow.includes(OBS_READ_GLOBAL_RULE) ? 0 : 1 };
  } catch {
    return { added: 1 };
  }
}

/** Agent provisioning strategy. */
const agentStrategy: ProvisionStrategy = {
  resourceKind: "agents",
  outputDir: path.join(CLAUDE_DIR, "agents"),
  enumerate: (tracker) => tracker.listAgents(),
  writeProxy: async (resource, tracker, outputDir) => {
    const content = await tracker.readFile(resource.vaultRelativePath);
    if (!content.ok) {
      throw new Error(`read vault agent ${resource.name}: ${content.error.message}`);
    }
    const proxyContent = buildProxyContent(
      resource.name,
      resource.description,
      content.value,
      tracker.context.name,
    );
    return writeProxyAgent(resource.name, proxyContent, outputDir);
  },
  syncPermissions: (settingsPath) => ensureObsReadPermission(settingsPath),
  countPermissions: (settingsPath) => countObsReadPermission(settingsPath),
};

/** Execute the provision-agents command. */
export async function run(args: ProvisionArgs): Promise<number> {
  return runProvision(args, agentStrategy);
}
