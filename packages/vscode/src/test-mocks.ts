import type { Mock } from "vitest";
import { vi } from "vitest";

import type { LocalIndexTracker } from "@obsidian-vfs/core";
import { makeLocalIndexTrackerWith } from "@obsidian-vfs/core/testing";

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

/** Mock factory for `vscode.Uri.from`. */
export function createMockUri(): {
  from: Mock;
} {
  return {
    from: vi.fn((c: { scheme: string; authority?: string; path: string }) => ({
      scheme: c.scheme,
      authority: c.authority ?? "",
      path: c.path,
      toString: () => `${c.scheme}://${c.authority ?? ""}${c.path}`,
    })),
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
      const treeView = { dispose: vi.fn() };
      (mock.window as Record<string, unknown>).createTreeView = vi.fn(() => treeView);
    }
  }
  if (parts.workspace) {
    mock.workspace = {
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
      }),
      registerFileSystemProvider: vi.fn(() => ({ dispose: vi.fn() })),
      updateWorkspaceFolders: vi.fn(),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      workspaceFolders: undefined,
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
): { scheme: string; authority: string; path: string; toString: () => string } {
  return {
    scheme: "obs",
    authority: vaultName,
    path: uriPath,
    toString: () => `obs://${vaultName}${uriPath}`,
  };
}

/** Build a minimal `vscode.ExtensionContext` for testing. */
export function fakeContext(): { subscriptions: { dispose: () => void }[] } {
  return { subscriptions: [] };
}

/** Default tracker context for provider tests. */
const PROVIDER_TRACKER_CONTEXT = { physicalPath: "/vault", name: "TestVault" };

/** Build a mock tracker with provider-required context. */
export function mockTracker(
  extraMethods: Partial<Record<keyof LocalIndexTracker, Mock>> = {},
  contextOverrides: Partial<{ physicalPath: string; name: string }> = {},
): LocalIndexTracker {
  const { tracker } = makeLocalIndexTrackerWith(
    "stat",
    { ok: true, value: { type: "file", mtime: 0, ctime: 0, size: 0 } },
    {
      readDirectory: vi.fn(),
      readFile: vi.fn(),
      onDidChangeFile: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      ...extraMethods,
    },
    { ...PROVIDER_TRACKER_CONTEXT, ...contextOverrides },
  );
  return tracker;
}
