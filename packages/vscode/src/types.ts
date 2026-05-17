/** Configuration section name for the extension. */
export const CONFIG_SECTION = "obsidianVFS";

/** Setting group prefixes for dot-separated subsections. */
export const CONFIG_GROUP = {
  vault: "vault",
  explorer: "explorer",
  statusBar: "statusBar",
  workspace: "workspace",
} as const;

/** Section-relative setting suffixes — single source of truth for setting names. */
export const CONFIG_PROP = {
  cliPath: "cliPath",
  timeoutMs: "timeoutMs",
  autoMount: "autoMount",
  depthLimit: "depthLimit",
  // Vault
  vaultGitIgnore: `${CONFIG_GROUP.vault}.gitIgnore`,
  vaultExcludeBlocked: `${CONFIG_GROUP.vault}.excludeBlocked`,
  vaultExcludeDotfiles: `${CONFIG_GROUP.vault}.excludeDotfiles`,
  vaultExcludeDotfilePattern: `${CONFIG_GROUP.vault}.excludeDotfilePattern`,
  // Status Bar
  statusBarEnabled: `${CONFIG_GROUP.statusBar}.enabled`,
  // Explorer
  explorerEnabled: `${CONFIG_GROUP.explorer}.enabled`,
  explorerTitle: `${CONFIG_GROUP.explorer}.title`,
  // Workspace
  workspaceEnabled: `${CONFIG_GROUP.workspace}.enabled`,
  workspaceCodeWorkspaceFile: `${CONFIG_GROUP.workspace}.codeWorkspaceFile`,
  workspaceExcludeUnmountedFolders: `${CONFIG_GROUP.workspace}.excludeUnmountedFolders`,
  workspaceExcludeUnmountedFiles: `${CONFIG_GROUP.workspace}.excludeUnmountedFiles`,
  workspaceExcludeUnmountedFilePattern: `${CONFIG_GROUP.workspace}.excludeUnmountedFilePattern`,
} as const;

/** Fully-qualified setting keys for `affectsConfiguration()` checks. Derived from CONFIG_PROP. */
export const CONFIG_KEY = Object.fromEntries(
  Object.entries(CONFIG_PROP).map(([k, v]) => [k, `${CONFIG_SECTION}.${v}`]),
) as {
  readonly [K in keyof typeof CONFIG_PROP]: `${typeof CONFIG_SECTION}.${(typeof CONFIG_PROP)[K]}`;
};

/** Command identifiers for the extension. */
export const COMMAND = {
  mount: `${CONFIG_SECTION}.mount`,
  mountNote: `${CONFIG_SECTION}.mountNote`,
  unmount: `${CONFIG_SECTION}.unmount`,
  openInObsidian: `${CONFIG_SECTION}.openInObsidian`,
  searchNotes: `${CONFIG_SECTION}.searchNotes`,
  copyPath: `${CONFIG_SECTION}.copyPath`,
} as const;

/** VSCode extension configuration read from `obsidianVFS` settings. */
export interface ExtensionConfig {
  readonly cliPath: string;
  readonly timeoutMs: number;
  readonly autoMount: readonly string[];
  readonly depthLimit: number;
  // Vault
  readonly vaultGitIgnore: boolean;
  readonly vaultExcludeBlocked: boolean;
  readonly vaultExcludeDotfiles: boolean;
  readonly vaultExcludeDotfilePattern: string;
  // Status Bar
  readonly statusBarEnabled: boolean;
  // Explorer
  readonly explorerEnabled: boolean;
  readonly explorerTitle: string;
  // Workspace
  readonly workspaceEnabled: boolean;
  readonly workspaceCodeWorkspaceFile: boolean;
  readonly workspaceExcludeUnmountedFolders: boolean;
  readonly workspaceExcludeUnmountedFiles: boolean;
  readonly workspaceExcludeUnmountedFilePattern: string;
}
