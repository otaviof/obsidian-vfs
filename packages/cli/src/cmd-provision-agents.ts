import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { scrubWikilinks } from "@obsidian-vfs/core";

import type { ProvisionArgs } from "./types.js";
import { EXIT_USAGE } from "./types.js";
import type { ProvisionStrategy } from "./cmd-provision-resources.js";
import {
  countPermissionRule,
  provisionPaths,
  run as runProvision,
  syncPermissionRule,
} from "./cmd-provision-resources.js";
import {
  buildFrontmatter,
  parseFrontmatterOverrides,
  splitFrontmatterAndBody,
} from "./build-frontmatter.js";
import { formatUsageError, writeStderr } from "./formatters.js";

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
  const overridesResult = parseFrontmatterOverrides(args.set, args.unset);
  if (!overridesResult.ok) {
    writeStderr(formatUsageError(overridesResult.error.message));
    return EXIT_USAGE;
  }
  const overrides = overridesResult.value;

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
      const { frontmatter, body } = splitFrontmatterAndBody(content.value);
      const sourceLines = frontmatter ? frontmatter.split("\n") : [];
      const scrubbedBody = scrubWikilinks(body, tracker.context.name);
      const fm = buildFrontmatter({
        name: resource.name,
        description: resource.description,
        sourceLines,
        remapModel: true,
        overrides,
      });
      const proxyContent = `---\n${fm.join("\n")}\n---\n${scrubbedBody}`;
      return writeProxyAgent(resource.name, proxyContent, outputDir);
    },
    syncPermissions: (settingsPath) => syncPermissionRule(settingsPath, args.pin),
    countPermissions: (settingsPath) => countPermissionRule(settingsPath, args.pin),
  };
  return runProvision(args, agentStrategy);
}
