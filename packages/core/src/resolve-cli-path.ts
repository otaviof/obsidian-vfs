/** Environment variable name for overriding the CLI path. */
export const OBSIDIAN_CLI_PATH = "OBSIDIAN_CLI_PATH";

/** Platform-specific default paths (single deterministic path per platform). */
export const PLATFORM_OBSIDIAN_CLI_PATHS: Readonly<Record<string, string>> = {
  darwin: "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli",
  linux: "/usr/local/bin/obsidian",
};

/** Options controlling CLI path resolution. */
export interface ResolveCliPathOptions {
  /** User-provided explicit path (from VSCode setting, --cli-path flag, etc.). */
  readonly userPath?: string | undefined;
  /** Environment variable map (defaults to `process.env`). */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Override `process.platform` for testing. */
  readonly platform?: string;
}

/** Deterministic, synchronous CLI path resolution. */
export function resolveCliPath(options?: ResolveCliPathOptions): string {
  const userPath = options?.userPath;
  if (userPath !== undefined && userPath !== "") return userPath;

  const env = options?.env ?? process.env;
  const envValue = env[OBSIDIAN_CLI_PATH];
  if (envValue !== undefined && envValue !== "") return envValue;

  const platform = options?.platform ?? process.platform;
  return PLATFORM_OBSIDIAN_CLI_PATHS[platform] ?? "obsidian";
}
