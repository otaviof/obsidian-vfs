import { access } from "node:fs/promises";
import path from "node:path";

import type { LocalIndexTracker } from "./local-index-tracker.js";
import type { MentionResult, VFSResult } from "./types.js";
import { processContent } from "./content-slice.js";
import { resolveResource, resolveSkillResource } from "./resolve-resource.js";
import { resolveWikilink } from "./resolve-wikilink.js";

/** Prefix for context mentions (`@obs:name`). */
export const MENTION_PREFIX = "@obs:";

/** Prefix for skill-only mentions (`/obs:name`). */
export const SKILL_PREFIX = "/obs:";

/** Split a reference on the first `#` into name and optional section. */
export function parseSection(reference: string): {
  namePart: string;
  section: string | undefined;
} {
  const hashIndex = reference.indexOf("#");
  if (hashIndex < 0) return { namePart: reference, section: undefined };
  const section = reference.slice(hashIndex + 1);
  return { namePart: reference.slice(0, hashIndex), section: section === "" ? undefined : section };
}

/** Read a resolved path and apply section slicing + wikilink scrubbing. */
async function readAndProcess(
  resolvedPath: string,
  section: string | undefined,
  tracker: LocalIndexTracker,
): Promise<VFSResult<string>> {
  const content = await tracker.readFile(resolvedPath);
  if (!content.ok) return content;

  return processContent(content.value, {
    section,
    scrubWikilinks: true,
    vaultName: tracker.context.name,
  });
}

async function resolveNonAgent(
  namePart: string,
  tracker: LocalIndexTracker,
  securityOptions: { vaultRoot: string; allowedFolders: readonly string[] },
): Promise<VFSResult<{ targetType: "file" | "skill"; resolvedPath: string }>> {
  if (tracker.context.vfsConfig.skillsDirs.length > 0) {
    const skillResult = await resolveSkillResource(
      namePart,
      tracker.context.vfsConfig.skillsDirs,
      securityOptions,
    );
    if (skillResult.ok) {
      return { ok: true, value: { targetType: "skill", resolvedPath: skillResult.value } };
    }
  }

  if (namePart.includes("/") || namePart.toLowerCase().endsWith(".md")) {
    const absolutePath = path.resolve(securityOptions.vaultRoot, namePart);
    try {
      await access(absolutePath);
      return { ok: true, value: { targetType: "file", resolvedPath: namePart } };
    } catch {
      const basename = path.basename(namePart, ".md");
      const wikilinkResult = await resolveWikilink(basename, {
        cli: tracker.cli,
        cache: tracker.cache,
        vaultRoot: tracker.context.physicalPath,
        allowedFolders: tracker.context.vfsConfig.allowedFolders,
        mode: tracker.context.mode,
      });
      if (wikilinkResult.ok) {
        return {
          ok: true,
          value: { targetType: "file", resolvedPath: wikilinkResult.value.resolvedPath },
        };
      }
      return { ok: true, value: { targetType: "file", resolvedPath: namePart } };
    }
  }

  const wikilinkResult = await resolveWikilink(namePart, {
    cli: tracker.cli,
    cache: tracker.cache,
    vaultRoot: tracker.context.physicalPath,
    allowedFolders: tracker.context.vfsConfig.allowedFolders,
    mode: tracker.context.mode,
  });
  if (!wikilinkResult.ok) return wikilinkResult;
  return {
    ok: true,
    value: { targetType: "file", resolvedPath: wikilinkResult.value.resolvedPath },
  };
}

/**
 * Parse and resolve an `@obs:` mention into a full MentionResult.
 */
export async function resolveMention(
  mention: string,
  tracker: LocalIndexTracker,
): Promise<VFSResult<MentionResult>> {
  if (!mention.startsWith(MENTION_PREFIX)) {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: `Invalid @obs: mention: missing prefix` },
    };
  }

  const raw = mention.slice(MENTION_PREFIX.length).trim();
  if (raw === "") {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: "Invalid @obs: mention: empty reference" },
    };
  }

  const { namePart, section } = parseSection(raw);
  if (namePart === "") {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: "Invalid @obs: mention: empty path" },
    };
  }

  let targetType: "file" | "agent" | "skill";
  let resolvedPath: string;

  const securityOptions = {
    vaultRoot: tracker.context.physicalPath,
    allowedFolders: tracker.context.vfsConfig.allowedFolders,
  };

  if (tracker.context.vfsConfig.agentsDirs.length > 0) {
    const agentResult = await resolveResource(
      namePart,
      tracker.context.vfsConfig.agentsDirs,
      securityOptions,
    );
    if (agentResult.ok) {
      targetType = "agent";
      resolvedPath = agentResult.value;
    } else {
      const resolved = await resolveNonAgent(namePart, tracker, securityOptions);
      if (!resolved.ok) return resolved;
      targetType = resolved.value.targetType;
      resolvedPath = resolved.value.resolvedPath;
    }
  } else {
    const resolved = await resolveNonAgent(namePart, tracker, securityOptions);
    if (!resolved.ok) return resolved;
    targetType = resolved.value.targetType;
    resolvedPath = resolved.value.resolvedPath;
  }

  const processed = await readAndProcess(resolvedPath, section, tracker);
  if (!processed.ok) return processed;

  return {
    ok: true,
    value: {
      targetType,
      resolvedPath,
      vaultName: tracker.context.name,
      content: processed.value,
      section,
    },
  };
}

/**
 * Parse and resolve a `/obs:` skill mention into a full MentionResult.
 */
export async function resolveSkillMention(
  mention: string,
  tracker: LocalIndexTracker,
): Promise<VFSResult<MentionResult>> {
  if (!mention.startsWith(SKILL_PREFIX)) {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: "Invalid /obs: mention: missing prefix" },
    };
  }

  const raw = mention.slice(SKILL_PREFIX.length).trim();
  if (raw === "") {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: "Invalid /obs: mention: empty reference" },
    };
  }

  const { namePart, section } = parseSection(raw);
  if (namePart === "") {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: "Invalid /obs: mention: empty path" },
    };
  }

  const skillResult = await tracker.resolveSkill(namePart);
  if (!skillResult.ok) return skillResult;

  const processed = await readAndProcess(skillResult.value, section, tracker);
  if (!processed.ok) return processed;

  return {
    ok: true,
    value: {
      targetType: "skill",
      resolvedPath: skillResult.value,
      vaultName: tracker.context.name,
      content: processed.value,
      section,
    },
  };
}
