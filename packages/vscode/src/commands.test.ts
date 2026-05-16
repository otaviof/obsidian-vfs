import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock, mockTracker } from "./test-mocks.js";

vi.mock("vscode", () =>
  createVscodeMock({
    window: true,
    workspace: true,
    commands: true,
    uri: true,
    configurationTarget: true,
  }),
);

vi.mock("./vault-tree-provider.js", () => ({
  readAutoMount: vi.fn().mockReturnValue([]),
  VaultTreeDataProvider: vi.fn(),
}));

import * as vscode from "vscode";

import { registerCommands } from "./commands.js";
import { SCHEME } from "./uri-adapter.js";
import { readAutoMount } from "./vault-tree-provider.js";

const mockReadAutoMount = vi.mocked(readAutoMount);

function fakeContext(): { subscriptions: { dispose: () => void }[] } {
  return { subscriptions: [] };
}

function fakeTreeProvider(): { refresh: ReturnType<typeof vi.fn> } {
  return { refresh: vi.fn() };
}

function setupConfigMock(): { update: ReturnType<typeof vi.fn> } {
  const update = vi.fn().mockResolvedValue(undefined);
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
    update,
  } as never);
  return { update };
}

describe("registerCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers six commands", () => {
    const ctx = fakeContext();
    const tracker = mockTracker();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(6);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "obsidianVFS.mount",
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "obsidianVFS.mountNote",
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "obsidianVFS.unmount",
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "obsidianVFS.openInObsidian",
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "obsidianVFS.searchNotes",
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "obsidianVFS.copyPath",
      expect.any(Function),
    );
  });
});

describe("mount command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Quick Pick with available folders and updates config", async () => {
    mockReadAutoMount.mockReturnValue([]);
    const { update } = setupConfigMock();

    const tracker = mockTracker({
      listFolders: vi.fn().mockResolvedValue({
        ok: true,
        value: ["10-projects", "20-areas"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce("10-projects/" as never);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      ["10-projects/", "20-areas/"],
      expect.anything(),
    );
    expect(update).toHaveBeenCalledWith(
      "autoMount",
      ["10-projects"],
      vscode.ConfigurationTarget.Workspace,
    );
    expect(tree.refresh).toHaveBeenCalled();
  });

  it("does nothing when user cancels Quick Pick", async () => {
    mockReadAutoMount.mockReturnValue([]);
    const { update } = setupConfigMock();

    const tracker = mockTracker({
      listFolders: vi.fn().mockResolvedValue({
        ok: true,
        value: ["folder"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(update).not.toHaveBeenCalled();
  });

  it("handles empty vault gracefully", async () => {
    const tracker = mockTracker({
      listFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("excludes already-mounted folders from Quick Pick", async () => {
    mockReadAutoMount.mockReturnValue(["10-projects"]);
    setupConfigMock();

    const tracker = mockTracker({
      listFolders: vi.fn().mockResolvedValue({
        ok: true,
        value: ["10-projects", "20-areas"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce("20-areas/" as never);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(["20-areas/"], expect.anything());
  });

  it("does nothing when all folders already mounted", async () => {
    mockReadAutoMount.mockReturnValue(["10-projects", "20-areas"]);

    const tracker = mockTracker({
      listFolders: vi.fn().mockResolvedValue({
        ok: true,
        value: ["10-projects", "20-areas"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("handles listFolders failure gracefully", async () => {
    const tracker = mockTracker({
      listFolders: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: "Vault unavailable" },
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("shows nested folders as full paths", async () => {
    mockReadAutoMount.mockReturnValue([]);
    setupConfigMock();

    const tracker = mockTracker({
      listFolders: vi.fn().mockResolvedValue({
        ok: true,
        value: ["10-projects", "10-projects/active", "20-areas"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce("10-projects/active/" as never);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      ["10-projects/", "10-projects/active/", "20-areas/"],
      expect.anything(),
    );
  });
});

describe("mountNote command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Quick Pick with vault notes and updates config", async () => {
    mockReadAutoMount.mockReturnValue([]);
    const { update } = setupConfigMock();

    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({
        ok: true,
        value: ["docs/overview.md", "notes/todo.md"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
      label: "overview",
      description: "docs/overview.md",
    });

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mountNote")![1] as () => Promise<void>;
    await handler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      [
        { label: "overview", description: "docs/overview.md" },
        { label: "todo", description: "notes/todo.md" },
      ],
      expect.objectContaining({ matchOnDescription: true }),
    );
    expect(update).toHaveBeenCalledWith(
      "autoMount",
      ["docs/overview.md"],
      vscode.ConfigurationTarget.Workspace,
    );
    expect(tree.refresh).toHaveBeenCalled();
  });

  it("excludes already-mounted notes from Quick Pick", async () => {
    mockReadAutoMount.mockReturnValue(["docs/overview.md"]);
    setupConfigMock();

    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({
        ok: true,
        value: ["docs/overview.md", "notes/todo.md"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
      label: "todo",
      description: "notes/todo.md",
    });

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mountNote")![1] as () => Promise<void>;
    await handler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      [{ label: "todo", description: "notes/todo.md" }],
      expect.objectContaining({ matchOnDescription: true }),
    );
  });

  it("does nothing when user cancels Quick Pick", async () => {
    mockReadAutoMount.mockReturnValue([]);
    const { update } = setupConfigMock();

    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({
        ok: true,
        value: ["notes/todo.md"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mountNote")![1] as () => Promise<void>;
    await handler();

    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing when listFiles returns empty", async () => {
    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mountNote")![1] as () => Promise<void>;
    await handler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("does nothing when all notes already mounted", async () => {
    mockReadAutoMount.mockReturnValue(["docs/overview.md", "notes/todo.md"]);

    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({
        ok: true,
        value: ["docs/overview.md", "notes/todo.md"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mountNote")![1] as () => Promise<void>;
    await handler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("does nothing when listFiles returns error", async () => {
    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "CLI_ERROR", message: "failed" },
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mountNote")![1] as () => Promise<void>;
    await handler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });
});

describe("unmount command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows mounted folders and removes selected from config", async () => {
    mockReadAutoMount.mockReturnValue(["10-projects", "20-areas"]);
    const { update } = setupConfigMock();

    const tracker = mockTracker();
    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce("10-projects" as never);

    const unmountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.unmount")![1] as () => Promise<void>;
    await unmountHandler();

    expect(update).toHaveBeenCalledWith(
      "autoMount",
      ["20-areas"],
      vscode.ConfigurationTarget.Workspace,
    );
    expect(tree.refresh).toHaveBeenCalled();
  });

  it("shows message when no folders mounted", async () => {
    mockReadAutoMount.mockReturnValue([]);

    const tracker = mockTracker();
    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const unmountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.unmount")![1] as () => Promise<void>;
    await unmountHandler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "No Obsidian VFS entries mounted",
    );
  });

  it("does nothing when user cancels Quick Pick", async () => {
    mockReadAutoMount.mockReturnValue(["notes"]);
    const { update } = setupConfigMock();

    const tracker = mockTracker();
    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

    const unmountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.unmount")![1] as () => Promise<void>;
    await unmountHandler();

    expect(update).not.toHaveBeenCalled();
  });
});

describe("openInObsidian command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls cli.open when active editor has obs:// URI", async () => {
    const mockOpen = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const tracker = mockTracker();
    (tracker as unknown as Record<string, unknown>).cli = { open: mockOpen };

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: { document: { uri: { scheme: SCHEME, path: "/note.md" } } },
      writable: true,
      configurable: true,
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const openHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.openInObsidian")![1] as () => Promise<void>;
    await openHandler();

    expect(mockOpen).toHaveBeenCalledWith("note.md");

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("shows message when no editor is active", async () => {
    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const tracker = mockTracker();
    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const openHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.openInObsidian")![1] as () => Promise<void>;
    await openHandler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("No Obsidian VFS file active");
  });

  it("calls cli.open when active editor has file:// URI under vault", async () => {
    const mockOpen = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const tracker = mockTracker();
    (tracker as unknown as Record<string, unknown>).cli = { open: mockOpen };

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: { document: { uri: { scheme: "file", fsPath: "/vault/notes/todo.md" } } },
      writable: true,
      configurable: true,
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const openHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.openInObsidian")![1] as () => Promise<void>;
    await openHandler();

    expect(mockOpen).toHaveBeenCalledWith("notes/todo.md");

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("handles cli.open failure gracefully", async () => {
    const mockOpen = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: "CLI_UNAVAILABLE", message: "stub" } });
    const tracker = mockTracker();
    (tracker as unknown as Record<string, unknown>).cli = { open: mockOpen };

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: { document: { uri: { scheme: SCHEME, path: "/note.md" } } },
      writable: true,
      configurable: true,
    });

    const channel = { appendLine: vi.fn(), dispose: vi.fn() };
    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    registerCommands(ctx as never, tracker, tree as never, channel as never);

    const openHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.openInObsidian")![1] as () => Promise<void>;
    await openHandler();

    expect(channel.appendLine).toHaveBeenCalledWith(expect.stringContaining("stub"));
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Could not open in Obsidian (is Obsidian running?)",
    );

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("handles editor without scheme in uri", async () => {
    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: { document: { uri: { scheme: "untitled", path: "" } } },
      writable: true,
      configurable: true,
    });

    const tracker = mockTracker();
    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const openHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.openInObsidian")![1] as () => Promise<void>;
    await openHandler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("No Obsidian VFS file active");

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });
});

describe("searchNotes command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Quick Pick with vault files and opens selected file", async () => {
    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({
        ok: true,
        value: ["docs/overview.md", "notes/todo.md"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
      label: "overview",
      description: "docs/overview.md",
    });

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.searchNotes")![1] as () => Promise<void>;
    await handler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      [
        { label: "overview", description: "docs/overview.md" },
        { label: "todo", description: "notes/todo.md" },
      ],
      expect.objectContaining({ matchOnDescription: true }),
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      expect.objectContaining({ scheme: "file", fsPath: "/vault/docs/overview.md" }),
    );
  });

  it("does nothing when user cancels Quick Pick", async () => {
    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({
        ok: true,
        value: ["notes/note.md"],
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.searchNotes")![1] as () => Promise<void>;
    await handler();

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it("does nothing when listFiles returns empty", async () => {
    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.searchNotes")![1] as () => Promise<void>;
    await handler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("does nothing when listFiles returns error", async () => {
    const tracker = mockTracker({
      listFiles: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "CLI_ERROR", message: "failed" },
      }),
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.searchNotes")![1] as () => Promise<void>;
    await handler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });
});

describe("copyPath command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies obs:// URI when active editor has obs:// scheme", async () => {
    const tracker = mockTracker();

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: { document: { uri: { scheme: SCHEME, path: "/notes/todo.md" } } },
      writable: true,
      configurable: true,
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.copyPath")![1] as () => Promise<void>;
    await handler();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith("obs://TestVault/notes/todo.md");

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("copies obs:// URI when active editor has file:// scheme under vault", async () => {
    const tracker = mockTracker();

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: { document: { uri: { scheme: "file", fsPath: "/vault/notes/todo.md" } } },
      writable: true,
      configurable: true,
    });

    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.copyPath")![1] as () => Promise<void>;
    await handler();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith("obs://TestVault/notes/todo.md");

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("shows info message when no vault file is active", async () => {
    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const tracker = mockTracker();
    const ctx = fakeContext();
    const tree = fakeTreeProvider();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, tree as never, channel);

    const handler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.copyPath")![1] as () => Promise<void>;
    await handler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("No Obsidian VFS file active");
  });
});
