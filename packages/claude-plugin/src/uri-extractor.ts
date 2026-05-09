import { URI_PREFIX, maskCodeRegions, parseObsUri } from "@obsidian-vfs/core";

/** A single obs:// URI extracted from text. */
export interface ExtractedUri {
  readonly uri: string;
  readonly vaultName: string;
  readonly path: string;
  readonly section: string | undefined;
}

/** Pattern matching obs:// URIs — allows parens since encodeURIComponent preserves them. */
const OBS_URI_PATTERN = new RegExp(`${URI_PREFIX.replace("//", "\\/{2}")}[^\\s\\]>]+`, "g");

/** Trim unbalanced trailing parens (markdown link closers like `[text](obs://...)`). */
function trimTrailingParens(raw: string): string {
  let uri = raw;
  while (uri.endsWith(")") && (uri.match(/\(/g) ?? []).length < (uri.match(/\)/g) ?? []).length) {
    uri = uri.slice(0, -1);
  }
  return uri;
}

/** Extract all unique obs:// URIs from text, ignoring code blocks. */
export function extractObsUris(text: string): readonly ExtractedUri[] {
  const masked = maskCodeRegions(text);
  const seen = new Map<string, ExtractedUri>();

  const regex = new RegExp(OBS_URI_PATTERN.source, OBS_URI_PATTERN.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(masked)) !== null) {
    const uri = trimTrailingParens(match[0]);
    const parsed = parseObsUri(uri);
    if (!parsed.ok) continue;

    const key = `${parsed.value.vaultName}/${parsed.value.path}${
      parsed.value.section !== undefined ? `#${parsed.value.section}` : ""
    }`;

    if (!seen.has(key)) {
      seen.set(key, {
        uri,
        vaultName: parsed.value.vaultName,
        path: parsed.value.path,
        section: parsed.value.section,
      });
    }
  }

  return [...seen.values()];
}
