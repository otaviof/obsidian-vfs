import { MENTION_PREFIX, resolveMention } from "@obsidian-vfs/core";
import type { LocalIndexTracker } from "@obsidian-vfs/core";

import type { ResolvedMention } from "./types.js";
import { toAbsolutePath } from "./types.js";
import { extractObsUris } from "./uri-extractor.js";

/** Build an @obs: mention string from extracted URI components. */
function buildMention(path: string, section: string | undefined): string {
  const sectionPart = section !== undefined ? `#${section}` : "";
  return `${MENTION_PREFIX}${path}${sectionPart}`;
}

/** Resolve obs:// URI references found in content. */
export async function resolveObsUriReferences(
  content: string,
  tracker: LocalIndexTracker,
): Promise<readonly ResolvedMention[]> {
  const uris = extractObsUris(content);
  if (uris.length === 0) return [];

  const results = await Promise.all(
    uris.map(async (uri): Promise<ResolvedMention> => {
      const mention = buildMention(uri.path, uri.section);
      const fakeExtracted = {
        kind: "context" as const,
        raw: uri.uri,
        reference: uri.path + (uri.section !== undefined ? `#${uri.section}` : ""),
        startIndex: 0,
        endIndex: 0,
      };

      const result = await resolveMention(mention, tracker);
      if (result.ok) {
        return {
          status: "resolved",
          mention: fakeExtracted,
          targetType: result.value.targetType,
          resolvedPath: result.value.resolvedPath,
          absolutePath: toAbsolutePath(tracker, result.value.resolvedPath),
          section: result.value.section,
          content: result.value.content,
        };
      }
      return { status: "error", mention: fakeExtracted, errorMessage: result.error.message };
    }),
  );

  return results;
}
