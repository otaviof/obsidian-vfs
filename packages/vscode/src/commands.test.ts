import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock, mockTracker } from "./test-mocks.js";

vi.mock("vscode", () =>
  createVscodeMock({ window: true, workspace: true, commands: true, uri: true }),
);

import * as vscode from "vscode";

import { registerCommands } from "./commands.js";

function fakeContext(): { subscriptions: { dispose: () => void }[] } {
  return { subscriptions: [] };
}

describe("registerCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers three commands", () => {
    const ctx = fakeContext();
    const tracker = mockTracker();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(3);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "obsidianVFS.mount",
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
  });
});

describe("mount command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Quick Pick with vault folders and adds workspace folder", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          ["10-projects", "directory"],
          ["note.md", "file"],
          ["20-areas", "directory"],
        ],
      }),
    });

    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce("10-projects" as never);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      ["10-projects", "20-areas"],
      expect.anything(),
    );
    const updateCalls = vi.mocked(vscode.workspace.updateWorkspaceFolders).mock.calls;
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toBe(0);
    expect(updateCalls[0][2]).toMatchObject({ name: "Obsidian: 10-projects" });
  });

  it("does nothing when user cancels Quick Pick", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: true,
        value: [["folder", "directory"]],
      }),
    });

    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("handles empty vault gracefully", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });

    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it("skips already-mounted folders", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: true,
        value: [["10-projects", "directory"]],
      }),
    });

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [
        { uri: { scheme: "obs", path: "/10-projects" }, name: "Obsidian: 10-projects", index: 0 },
      ],
      writable: true,
      configurable: true,
    });

    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce("10-projects" as never);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("handles readDirectory failure gracefully", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "VAULT_NOT_FOUND", message: "Vault unavailable" },
      }),
    });

    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("filters out files when building folder list", async () => {
    const tracker = mockTracker({
      readDirectory: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          ["folder1", "directory"],
          ["note.md", "file"],
          ["folder2", "directory"],
          ["image.png", "file"],
        ],
      }),
    });

    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce("folder1" as never);

    const mountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.mount")![1] as () => Promise<void>;
    await mountHandler();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      ["folder1", "folder2"],
      expect.anything(),
    );
  });
});

describe("unmount command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows only obs:// folders and removes selected", async () => {
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [
        { uri: { scheme: "file", path: "/local" }, name: "Local", index: 0 },
        { uri: { scheme: "obs", path: "/notes" }, name: "Obsidian: notes", index: 1 },
      ],
      writable: true,
      configurable: true,
    });

    const tracker = mockTracker();
    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
      label: "Obsidian: notes",
      index: 1,
    } as never);

    const unmountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.unmount")![1] as () => Promise<void>;
    await unmountHandler();

    expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(1, 1);

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("shows message when no obs:// folders mounted", async () => {
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [{ uri: { scheme: "file", path: "/local" }, name: "Local", index: 0 }],
      writable: true,
      configurable: true,
    });

    const tracker = mockTracker();
    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    const unmountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.unmount")![1] as () => Promise<void>;
    await unmountHandler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "No Obsidian VFS folders mounted",
    );

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("does nothing when user cancels Quick Pick", async () => {
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [{ uri: { scheme: "obs", path: "/notes" }, name: "Obsidian: notes", index: 0 }],
      writable: true,
      configurable: true,
    });

    const tracker = mockTracker();
    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

    const unmountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.unmount")![1] as () => Promise<void>;
    await unmountHandler();

    expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("handles undefined workspaceFolders", async () => {
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const tracker = mockTracker();
    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    const unmountHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.unmount")![1] as () => Promise<void>;
    await unmountHandler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "No Obsidian VFS folders mounted",
    );
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
      value: { document: { uri: { scheme: "obs", path: "/note.md" } } },
      writable: true,
      configurable: true,
    });

    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

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
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

    const openHandler = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((c) => c[0] === "obsidianVFS.openInObsidian")![1] as () => Promise<void>;
    await openHandler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("No Obsidian VFS file active");
  });

  it("shows message when active editor is not obs://", async () => {
    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: { document: { uri: { scheme: "file", path: "/local.md" } } },
      writable: true,
      configurable: true,
    });

    const tracker = mockTracker();
    const ctx = fakeContext();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

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

  it("handles cli.open failure gracefully", async () => {
    const mockOpen = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "stub" } });
    const tracker = mockTracker();
    (tracker as unknown as Record<string, unknown>).cli = { open: mockOpen };

    Object.defineProperty(vscode.window, "activeTextEditor", {
      value: { document: { uri: { scheme: "obs", path: "/note.md" } } },
      writable: true,
      configurable: true,
    });

    const channel = { appendLine: vi.fn(), dispose: vi.fn() };
    const ctx = fakeContext();
    registerCommands(ctx as never, tracker, channel as never);

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
    const channel = { appendLine: vi.fn(), dispose: vi.fn() } as never;
    registerCommands(ctx as never, tracker, channel);

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
