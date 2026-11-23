import { ERR } from "./types.js";
import type { VFSResult } from "./types.js";

/** The canonical URI scheme identifier (`obs`). */
export const URI_SCHEME = "obs";

/** Full URI prefix including the `://` separator (`obs://`). */
export const URI_PREFIX = `${URI_SCHEME}://`;

/** The alias scheme identifier (`vault`), interchangeable with `obs`. */
export const ALIAS_SCHEME = "vault";

/** All accepted URI schemes, canonical first. */
export const URI_SCHEMES = [URI_SCHEME, ALIAS_SCHEME] as const;

/** A URI scheme accepted by `parseObsUri`. */
export type UriScheme = (typeof URI_SCHEMES)[number];

/** Comma-separated scheme list for error messages naming every accepted scheme. */
const ACCEPTED_SCHEMES = URI_SCHEMES.join("|");

/**
 * Decomposed form of an `obs://[vault-name]/path/to/note.md[#section]` URI.
 * `scheme` reports which accepted scheme the input used (normalized lowercase).
 */
export interface ObsUriComponents {
  readonly vaultName: string;
  readonly path: string;
  readonly section: string | undefined;
  readonly scheme: UriScheme;
}

/**
 * Case-insensitive match of an accepted scheme prefix (`obs://` or `vault://`).
 * Returns the normalized lowercase scheme, or `undefined` if none matches.
 */
export function matchUriPrefix(uri: string): UriScheme | undefined {
  for (const scheme of URI_SCHEMES) {
    if (uri.toLowerCase().startsWith(`${scheme}://`)) return scheme;
  }
  return undefined;
}

/**
 * Parse an `obs://` or `vault://` URI into its components. Returns `INVALID_URI`
 * on malformed input. Components are URL-decoded.
 */
export function parseObsUri(uri: string): VFSResult<ObsUriComponents> {
  const scheme = matchUriPrefix(uri);
  if (scheme === undefined) {
    return {
      ok: false,
      error: {
        code: ERR.INVALID_URI,
        message: `Invalid URI: missing or wrong scheme (expected ${ACCEPTED_SCHEMES})`,
      },
    };
  }

  const rest = uri.slice(scheme.length + 3);
  const slashIndex = rest.indexOf("/");

  if (slashIndex < 0) {
    return {
      ok: false,
      error: { code: ERR.INVALID_URI, message: `Invalid ${URI_PREFIX} URI: missing path` },
    };
  }

  const rawVault = rest.slice(0, slashIndex);
  if (rawVault === "") {
    return {
      ok: false,
      error: { code: ERR.INVALID_URI, message: `Invalid ${URI_PREFIX} URI: empty vault name` },
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
      error: { code: ERR.INVALID_URI, message: `Invalid ${URI_PREFIX} URI: empty path` },
    };
  }
  try {
    return {
      ok: true,
      value: {
        vaultName: decodeURIComponent(rawVault),
        path: decodeURIComponent(rawPath),
        section: rawSection !== undefined ? decodeURIComponent(rawSection) : undefined,
        scheme,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: ERR.INVALID_URI,
        message: `Invalid URI: malformed percent-encoding`,
      },
    };
  }
}

/**
 * Construct a URI string from decomposed components. Defaults to the canonical
 * `obs://` scheme; pass `scheme` to preserve a parsed input's scheme.
 * Round-trip: `buildObsUri(parseObsUri(uri).value)` reproduces the input scheme.
 */
export function buildObsUri(
  components: Omit<ObsUriComponents, "scheme"> & { readonly scheme?: UriScheme },
): string {
  const scheme = components.scheme ?? URI_SCHEME;
  const vault = encodeURIComponent(components.vaultName);
  const p = components.path.split("/").map(encodeURIComponent).join("/");
  let uri = `${scheme}://${vault}/${p}`;
  if (components.section !== undefined) {
    uri += `#${encodeURIComponent(components.section)}`;
  }
  return uri;
}
