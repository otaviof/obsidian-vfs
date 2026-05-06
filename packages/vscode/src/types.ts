/** VSCode extension configuration read from `obsidianVFS` settings. */
export interface ExtensionConfig {
  readonly cliPath: string;
  readonly timeoutMs: number;
  readonly autoMount: readonly string[];
  readonly explorer: boolean;
  readonly statusBar: boolean;
  readonly workspace: boolean;
}
