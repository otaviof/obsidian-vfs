import { afterEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock, mockLocalIndexTracker } from "./test-helpers.js";

vi.mock("vscode", () => createVscodeMock({ window: true, statusBar: true }));

import * as vscode from "vscode";

import { StatusBarManager } from "./status-bar.js";

describe("StatusBarManager", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  it("creates status bar item with correct text", () => {
    const tracker = mockLocalIndexTracker({}, { name: "MyVault" });
    const manager = new StatusBarManager(tracker);

    const createItem = vi.mocked(vscode.window.createStatusBarItem);
    expect(createItem).toHaveBeenCalledWith(vscode.StatusBarAlignment.Left, 100);

    const item = createItem.mock.results[0].value as {
      text: string;
      tooltip: string;
      command: string;
      show: ReturnType<typeof vi.fn>;
    };
    expect(item.text).toBe("$(book) MyVault (full)");
    expect(item.command).toBe("obsidianVFS.mount");
    expect(item.show).not.toHaveBeenCalled();

    manager.dispose();
  });

  it("handles degraded mode display", () => {
    const tracker = mockLocalIndexTracker({}, { name: "TestVault" });
    (tracker.context as unknown as Record<string, unknown>).mode = "degraded";
    new StatusBarManager(tracker);

    const item = vi.mocked(vscode.window.createStatusBarItem).mock.results[0].value as {
      text: string;
    };
    expect(item.text).toBe("$(book) TestVault (degraded)");
  });

  it("disposes the item on dispose()", () => {
    const tracker = mockLocalIndexTracker();
    const manager = new StatusBarManager(tracker);

    const item = vi.mocked(vscode.window.createStatusBarItem).mock.results[0].value as {
      dispose: ReturnType<typeof vi.fn>;
    };

    manager.dispose();
    expect(item.dispose).toHaveBeenCalled();
  });

  it("sets tooltip", () => {
    const tracker = mockLocalIndexTracker();
    new StatusBarManager(tracker);

    const item = vi.mocked(vscode.window.createStatusBarItem).mock.results[0].value as {
      tooltip: string;
    };
    expect(item.tooltip).toContain("Obsidian VFS");
  });

  it("show() calls item.show()", () => {
    const tracker = mockLocalIndexTracker();
    const manager = new StatusBarManager(tracker);

    const item = vi.mocked(vscode.window.createStatusBarItem).mock.results[0].value as {
      show: ReturnType<typeof vi.fn>;
    };

    manager.show();
    expect(item.show).toHaveBeenCalled();
  });

  it("hide() calls item.hide()", () => {
    const tracker = mockLocalIndexTracker();
    const manager = new StatusBarManager(tracker);

    const item = vi.mocked(vscode.window.createStatusBarItem).mock.results[0].value as {
      hide: ReturnType<typeof vi.fn>;
    };

    manager.hide();
    expect(item.hide).toHaveBeenCalled();
  });
});
