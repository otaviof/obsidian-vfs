import type { VFSResult } from "./types.js";

/** The URI scheme identifier (`obs`). */
export const URI_SCHEME = "obs";

/** Full URI prefix including the `://` separator (`obs://`). */
export const URI_PREFIX = `${URI_SCHEME}://`;

/**
 * Decomposed form of an `obs://[vault-name]/path/to/note.md[#section]` URI.
 */
export interface ObsUriComponents {
  readonly vaultName: string;
  readonly path: string;
  readonly section: string | undefined;
}

/**
 * Parse an `obs://` URI into its components. Returns `INVALID_URI` on malformed
 * input. Components are URL-decoded.
 */
export function parseObsUri(uri: string): VFSResult<ObsUriComponents> {
  if (!uri.toLowerCase().startsWith(URI_PREFIX)) {
    return {
      ok: false,
      error: {
        code: "INVALID_URI",
        message: `Invalid ${URI_PREFIX} URI: missing or wrong scheme`,
      },
    };
  }

  const rest = uri.slice(URI_PREFIX.length);
  const slashIndex = rest.indexOf("/");

  if (slashIndex < 0) {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: `Invalid ${URI_PREFIX} URI: missing path` },
    };
  }

  const rawVault = rest.slice(0, slashIndex);
  if (rawVault === "") {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: `Invalid ${URI_PREFIX} URI: empty vault name` },
    };
  }

  const afterVault = rest.slice(slashIndex + 1);
  const hashIndex = afterVault.indexOf("#");

  let rawPath: string;
  let rawSection: string | undefined;

  if (hashIndex < 0) {
    rawPath = afterVault;
    rawSection = undefined;
  } else {
    rawPath = afterVault.slice(0, hashIndex);
    const sectionPart = afterVault.slice(hashIndex + 1);
    rawSection = sectionPart === "" ? undefined : sectionPart;
  }

  if (rawPath === "") {
    return {
      ok: false,
      error: { code: "INVALID_URI", message: `Invalid ${URI_PREFIX} URI: empty path` },
    };
  }

  try {
    return {
      ok: true,
      value: {
        vaultName: decodeURIComponent(rawVault),
        path: decodeURIComponent(rawPath),
        section: rawSection !== undefined ? decodeURIComponent(rawSection) : undefined,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_URI",
        message: `Invalid ${URI_PREFIX} URI: malformed percent-encoding`,
      },
    };
  }
}

/**
 * Construct the canonical `obs://` URI string from decomposed components.
 * Round-trip: `buildObsUri(parseObsUri(uri).value)` produces the normalized form.
 */
export function buildObsUri(components: ObsUriComponents): string {
  const vault = encodeURIComponent(components.vaultName);
  const p = components.path.split("/").map(encodeURIComponent).join("/");
  let uri = `${URI_PREFIX}${vault}/${p}`;
  if (components.section !== undefined) {
    uri += `#${encodeURIComponent(components.section)}`;
  }
  return uri;
}
