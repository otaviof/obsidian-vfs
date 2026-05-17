/** Configuration section name for the extension. */
export const CONFIG_SECTION = "obsidianVFS";

/** Default regex for hiding Obsidian files at partially-mounted vault levels. */
export const DEFAULT_EXCLUDE_FILE_PATTERN = "\\.(md|base|canvas)$";

/** Fully-qualified setting keys used in `affectsConfiguration()` checks. */
export const CONFIG_KEY = {
  explorer: `${CONFIG_SECTION}.explorer`,
  statusBar: `${CONFIG_SECTION}.statusBar`,
  autoMount: `${CONFIG_SECTION}.autoMount`,
  excludeFilePattern: `${CONFIG_SECTION}.excludeFilePattern`,
  workspace: `${CONFIG_SECTION}.workspace`,
  workspaceFile: `${CONFIG_SECTION}.workspaceFile`,
  depthLimit: `${CONFIG_SECTION}.depthLimit`,
} as const;

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
  readonly excludeFilePattern: string;
  readonly explorer: boolean;
  readonly statusBar: boolean;
  readonly workspace: boolean;
  readonly workspaceFile: boolean;
}
