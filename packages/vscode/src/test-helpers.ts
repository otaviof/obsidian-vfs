import type { Mock } from "vitest";
import { vi } from "vitest";

import type { LocalIndexTracker } from "@obsidian-vfs/core";
import { makeLocalIndexTrackerWith } from "@obsidian-vfs/core/testing";

import packageJson from "../package.json";
import { SCHEME } from "./scheme.js";
import { CONFIG_PROP, CONFIG_SECTION } from "./types.js";
import type { ExtensionConfig } from "./types.js";
import type { SyncFilesExcludeOptions } from "./workspace-folder.js";

const configProperties = packageJson.contributes.configuration.properties as Record<
  string,
  { default: unknown }
>;

/** Read a setting's default value from `package.json`. */
function configDefault<T>(prop: string): T {
  return configProperties[`${CONFIG_SECTION}.${prop}`].default as T;
}

/** Default `SyncFilesExcludeOptions` derived from `package.json` defaults. */
export const defaultSyncOptions: SyncFilesExcludeOptions = {
  excludeBlocked: configDefault(CONFIG_PROP.vaultExcludeBlocked),
  excludeDotfiles: configDefault(CONFIG_PROP.vaultExcludeDotfiles),
  excludeDotfilePattern: configDefault(CONFIG_PROP.vaultExcludeDotfilePattern),
  excludeUnmountedFolders: configDefault(CONFIG_PROP.workspaceExcludeUnmountedFolders),
  excludeUnmountedFiles: configDefault(CONFIG_PROP.workspaceExcludeUnmountedFiles),
  excludeUnmountedFilePattern: configDefault(CONFIG_PROP.workspaceExcludeUnmountedFilePattern),
};

/** Build a fake `ExtensionConfig` with defaults from `package.json`. */
export function fakeExtensionConfig(overrides?: Partial<ExtensionConfig>): ExtensionConfig {
  return {
    cliPath: configDefault(CONFIG_PROP.cliPath),
    timeoutMs: configDefault(CONFIG_PROP.timeoutMs),
    autoMount: configDefault(CONFIG_PROP.autoMount),
    depthLimit: configDefault(CONFIG_PROP.depthLimit),
    vaultGitIgnore: configDefault(CONFIG_PROP.vaultGitIgnore),
    vaultExcludeBlocked: configDefault(CONFIG_PROP.vaultExcludeBlocked),
    vaultExcludeDotfiles: configDefault(CONFIG_PROP.vaultExcludeDotfiles),
    vaultExcludeDotfilePattern: configDefault(CONFIG_PROP.vaultExcludeDotfilePattern),
    statusBarEnabled: configDefault(CONFIG_PROP.statusBarEnabled),
    explorerEnabled: configDefault(CONFIG_PROP.explorerEnabled),
    explorerTitle: configDefault(CONFIG_PROP.explorerTitle),
    workspaceEnabled: configDefault(CONFIG_PROP.workspaceEnabled),
    workspaceCodeWorkspaceFile: configDefault(CONFIG_PROP.workspaceCodeWorkspaceFile),
    workspaceExcludeUnmountedFolders: configDefault(CONFIG_PROP.workspaceExcludeUnmountedFolders),
    workspaceExcludeUnmountedFiles: configDefault(CONFIG_PROP.workspaceExcludeUnmountedFiles),
    workspaceExcludeUnmountedFilePattern: configDefault(
      CONFIG_PROP.workspaceExcludeUnmountedFilePattern,
    ),
    ...overrides,
  };
}

/** Reusable `EventEmitter` mock matching VSCode's `EventEmitter` contract. */
export function createMockEventEmitter(): new () => {
  event: (listener: (e: unknown) => void) => { dispose: () => void };
  fire: (data: unknown) => void;
  dispose: Mock;
} {
  return class {
    #listeners: ((e: unknown) => void)[] = [];
    event = (listener: (e: unknown) => void) => {
      this.#listeners.push(listener);
      return { dispose: () => undefined };
    };
    fire = (data: unknown) => this.#listeners.forEach((l) => l(data));
    dispose = vi.fn();
  };
}

/** Mock factories for `vscode.FileSystemError` static methods. */
export function createMockFileSystemError(): Record<
  "FileNotFound" | "NoPermissions" | "Unavailable" | "FileExists",
  Mock
> {
  return {
    FileNotFound: vi.fn((uri: unknown) => new Error(`FileNotFound: ${String(uri)}`)),
    NoPermissions: vi.fn((msg: unknown) => new Error(`NoPermissions: ${String(msg)}`)),
    Unavailable: vi.fn((uri: unknown) => new Error(`Unavailable: ${String(uri)}`)),
    FileExists: vi.fn((uri: unknown) => new Error(`FileExists: ${String(uri)}`)),
  };
}

/** Mock factory for `vscode.Uri.from` and `vscode.Uri.file`. */
export function createMockUri(): {
  from: Mock;
  file: Mock;
  parse: Mock;
} {
  return {
    from: vi.fn((c: { scheme: string; authority?: string; path: string }) => ({
      scheme: c.scheme,
      authority: c.authority ?? "",
      path: c.path,
      fsPath: c.path,
      toString: () => `${c.scheme}://${c.authority ?? ""}${c.path}`,
    })),
    file: vi.fn((filePath: string) => ({
      scheme: "file",
      authority: "",
      path: filePath,
      fsPath: filePath,
      toString: () => `file://${filePath}`,
    })),
    parse: vi.fn((value: string) => {
      const match = /^([a-z]+):\/\/([^/]*)(\/.*)?$/.exec(value);
      if (match) {
        return {
          scheme: match[1],
          authority: match[2] || "",
          path: match[3] || "/",
          fsPath: match[3] || "/",
          toString: () => value,
        };
      }
      return { scheme: "file", authority: "", path: value, fsPath: value, toString: () => value };
    }),
  };
}

/** Full composable vscode mock — each test opts in to the parts it needs. */
export function createVscodeMock(
  parts: {
    fileSystemError?: boolean;
    fileType?: boolean;
    fileChangeType?: boolean;
    eventEmitter?: boolean;
    uri?: boolean;
    window?: boolean;
    workspace?: boolean;
    commands?: boolean;
    languages?: boolean;
    statusBar?: boolean;
    treeView?: boolean;
    documentLink?: boolean;
    range?: boolean;
    configurationTarget?: boolean;
  } = {},
): Record<string, unknown> {
  const mock: Record<string, unknown> = {};

  if (parts.fileSystemError) {
    mock.FileSystemError = createMockFileSystemError();
  }
  if (parts.fileType) {
    mock.FileType = { File: 1, Directory: 2 };
  }
  if (parts.fileChangeType) {
    mock.FileChangeType = { Changed: 1, Created: 2, Deleted: 3 };
  }
  if (parts.eventEmitter) {
    mock.EventEmitter = createMockEventEmitter();
  }
  if (parts.uri) {
    mock.Uri = createMockUri();
  }
  if (parts.window) {
    mock.env = { clipboard: { writeText: vi.fn() } };
    const outputChannel = { appendLine: vi.fn(), dispose: vi.fn() };
    mock.window = {
      createOutputChannel: vi.fn(() => outputChannel),
      showQuickPick: vi.fn(),
      showInformationMessage: vi.fn(),
      activeTextEditor: undefined,
    };
    if (parts.statusBar) {
      const statusBarItem = {
        text: "",
        tooltip: "",
        command: "",
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      };
      (mock.window as Record<string, unknown>).createStatusBarItem = vi.fn(() => statusBarItem);
      mock.StatusBarAlignment = { Left: 1, Right: 2 };
    }
    if (parts.treeView) {
      const treeView = {
        dispose: vi.fn(),
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      };
      (mock.window as Record<string, unknown>).createTreeView = vi.fn(() => treeView);
    }
  }
  if (parts.workspace) {
    mock.workspace = {
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn((key: string, defaultValue?: unknown) => {
          if (defaultValue !== undefined) return defaultValue;
          const fqKey = `${CONFIG_SECTION}.${key}`;
          if (fqKey in configProperties) return configProperties[fqKey].default;
          return undefined;
        }),
      }),
      registerFileSystemProvider: vi.fn(() => ({ dispose: vi.fn() })),
      updateWorkspaceFolders: vi.fn(),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      workspaceFolders: undefined,
      fs: {
        readFile: vi.fn(),
        copy: vi.fn(),
      },
    };
  }
  if (parts.commands) {
    mock.commands = { registerCommand: vi.fn(), executeCommand: vi.fn() };
  }
  if (parts.languages) {
    mock.languages = { registerDocumentLinkProvider: vi.fn(() => ({ dispose: vi.fn() })) };
  }
  if (parts.documentLink) {
    mock.DocumentLink = class {
      range: unknown;
      target: unknown;
      constructor(range: unknown, target?: unknown) {
        this.range = range;
        this.target = target;
      }
    };
  }
  if (parts.configurationTarget) {
    mock.ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
  }
  if (parts.treeView) {
    mock.TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
    mock.TreeItem = class {
      label: string;
      collapsibleState: number;
      resourceUri: unknown;
      contextValue: string | undefined;
      command: unknown;
      constructor(label: string, collapsibleState = 0) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    };
  }
  if (parts.range) {
    mock.Range = class {
      start: { line: number; character: number };
      end: { line: number; character: number };
      constructor(
        startLineOrPos: number | { line: number; character: number },
        startCharOrEnd: number | { line: number; character: number },
        endLine?: number,
        endChar?: number,
      ) {
        if (typeof startLineOrPos === "object" && typeof startCharOrEnd === "object") {
          this.start = startLineOrPos;
          this.end = startCharOrEnd;
        } else if (
          typeof startLineOrPos === "number" &&
          typeof startCharOrEnd === "number" &&
          typeof endLine === "number" &&
          typeof endChar === "number"
        ) {
          this.start = { line: startLineOrPos, character: startCharOrEnd };
          this.end = { line: endLine, character: endChar };
        } else {
          throw new Error("Invalid Range constructor arguments");
        }
      }
    };
  }

  return mock;
}

/** Build a minimal `vscode.Uri`-shaped object for testing. */
export function fakeUri(
  uriPath: string,
  vaultName = "TestVault",
  scheme = SCHEME,
): { scheme: string; authority: string; path: string; fsPath: string; toString: () => string } {
  return {
    scheme,
    authority: scheme === SCHEME ? vaultName : "",
    path: uriPath,
    fsPath: uriPath,
    toString: () => (scheme === SCHEME ? `${SCHEME}://${vaultName}${uriPath}` : `file://${uriPath}`),
  };
}

/** Build a minimal `vscode.ExtensionContext` for testing. */
export function fakeContext(): {
  subscriptions: { dispose: () => void }[];
  workspaceState: {
    get: (key: string, fallback?: unknown) => unknown;
    update: (key: string, value: unknown) => Promise<void>;
  };
} {
  const store = new Map<string, unknown>();
  return {
    subscriptions: [],
    workspaceState: {
      get: (key: string, fallback?: unknown) => store.get(key) ?? fallback,
      update: (key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve();
      },
    },
  };
}

/** Default tracker context for provider tests. */
const PROVIDER_TRACKER_CONTEXT = { physicalPath: "/vault", name: "TestVault" };

/** Build a mock tracker with provider-required context. */
export function mockLocalIndexTracker(
  extraMethods: Partial<Record<keyof LocalIndexTracker, Mock>> = {},
  contextOverrides: Partial<{ physicalPath: string; name: string }> = {},
): LocalIndexTracker {
  const { tracker } = makeLocalIndexTrackerWith(
    "stat",
    { ok: true, value: { type: "file", mtime: 0, ctime: 0, size: 0 } },
    {
      readDirectory: vi.fn(),
      readFile: vi.fn(),
      listFolders: vi.fn(),
      onDidChangeFile: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      ...extraMethods,
    },
    { ...PROVIDER_TRACKER_CONTEXT, ...contextOverrides },
  );
  return tracker;
}
