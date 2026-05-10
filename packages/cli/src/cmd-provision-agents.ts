import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { remapModelLine, scrubWikilinks } from "@obsidian-vfs/core";

import type { ProvisionArgs } from "./types.js";
import type { ProvisionStrategy } from "./cmd-provision-resources.js";
import {
  countPermissionRule,
  provisionPaths,
  run as runProvision,
  syncPermissionRule,
} from "./cmd-provision-resources.js";

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
    const remapped = remapModelLine(frontmatter);
    const fm = ensureNameInFrontmatter(remapped, name);
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

/** Execute the provision-agents command. */
export async function run(args: ProvisionArgs): Promise<number> {
  const { baseDir, settingsPath } = provisionPaths(args.user);

  const agentStrategy: ProvisionStrategy = {
    resourceKind: "agents",
    outputDir: path.join(baseDir, "agents"),
    settingsPath,
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
    syncPermissions: (settingsPath) => syncPermissionRule(settingsPath, args.pin),
    countPermissions: (settingsPath) => countPermissionRule(settingsPath, args.pin),
  };
  return runProvision(args, agentStrategy);
}
