import type { LocalIndexTracker } from "./local-index-tracker.js";
import type { MentionResult, VFSResult } from "./types.js";
import { processContent } from "./content-slice.js";
import { resolveResource } from "./resolve-resource.js";
import { resolveWikilink } from "./resolve-wikilink.js";

async function resolveNonAgent(
  namePart: string,
  tracker: LocalIndexTracker,
  securityOptions: { vaultRoot: string; allowedFolders: readonly string[] },
): Promise<VFSResult<{ targetType: "file" | "skill"; resolvedPath: string }>> {
  if (tracker.context.vfsConfig.skillsDirs.length > 0) {
    const skillResult = await resolveResource(
      namePart,
      tracker.context.vfsConfig.skillsDirs,
      securityOptions,
    );
    if (skillResult.ok) {
      return { ok: true, value: { targetType: "skill", resolvedPath: skillResult.value } };
    }
  }

  if (namePart.includes("/") || namePart.toLowerCase().endsWith(".md")) {
    return { ok: true, value: { targetType: "file", resolvedPath: namePart } };
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

/** Required prefix for vault mention strings. */
const MENTION_PREFIX = "@obs:";

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

  const hashIndex = raw.indexOf("#");
  const section =
    hashIndex >= 0 && raw.slice(hashIndex + 1) !== "" ? raw.slice(hashIndex + 1) : undefined;
  const namePart = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
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

  const content = await tracker.readFile(resolvedPath);
  if (!content.ok) return content;

  const processed = processContent(content.value, {
    section,
    scrubWikilinks: true,
    vaultName: tracker.context.name,
  });
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
