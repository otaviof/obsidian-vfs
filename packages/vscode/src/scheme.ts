/** URI scheme used by the Obsidian VFS file system provider. */
export const SCHEME = "obs";

/** Alias scheme interchangeable with `SCHEME`. */
export const ALIAS_SCHEME = "vault";

/** All URI schemes managed by this extension. */
export const SCHEMES = [SCHEME, ALIAS_SCHEME] as const;

/** Check whether a URI scheme is managed by this extension. */
export function isManagedScheme(scheme: string): scheme is (typeof SCHEMES)[number] {
  return (SCHEMES as readonly string[]).includes(scheme);
}
