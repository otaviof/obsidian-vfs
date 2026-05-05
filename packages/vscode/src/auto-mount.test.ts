import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-mocks.js";

vi.mock("vscode", () => createVscodeMock({ workspace: true, uri: true }));

import * as vscode from "vscode";

import { autoMountFromConfig } from "./auto-mount.js";
import type { ExtensionConfig } from "./types.js";

function config(autoMount: string[]): ExtensionConfig {
  return { cliPath: "obsidian", timeoutMs: 10_000, autoMount };
}

describe("autoMountFromConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(vscode.workspace.updateWorkspaceFolders).mockClear();
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("mounts folders listed in config", () => {
    autoMountFromConfig(config(["10-projects", "20-areas"]), "MyVault");

    const calls = vi.mocked(vscode.workspace.updateWorkspaceFolders).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(0);
    expect(calls[0][1]).toBe(0);
    expect(calls[0][2]).toMatchObject({ name: "Obsidian: 10-projects" });
    expect(calls[0][3]).toMatchObject({ name: "Obsidian: 20-areas" });
  });

  it("skips already-mounted folders", () => {
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [{ uri: { scheme: "obs", path: "/10-projects" }, index: 0 }],
      writable: true,
      configurable: true,
    });

    autoMountFromConfig(config(["10-projects", "20-areas"]), "MyVault");

    const calls = vi.mocked(vscode.workspace.updateWorkspaceFolders).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(1);
    expect(calls[0][2]).toMatchObject({ name: "Obsidian: 20-areas" });
  });

  it("does nothing when autoMount is empty", () => {
    autoMountFromConfig(config([]), "MyVault");
    expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it("handles root mount with appropriate label", () => {
    autoMountFromConfig(config([""]), "MyVault");

    const calls = vi.mocked(vscode.workspace.updateWorkspaceFolders).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({ name: "Obsidian: MyVault" });
  });

  it("calls updateWorkspaceFolders once with all new entries", () => {
    autoMountFromConfig(config(["a", "b", "c"]), "V");
    expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledTimes(1);
  });

  it("does not call updateWorkspaceFolders when all already mounted", () => {
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [
        { uri: { scheme: "obs", path: "/a" }, index: 0 },
        { uri: { scheme: "obs", path: "/b" }, index: 1 },
      ],
      writable: true,
      configurable: true,
    });

    autoMountFromConfig(config(["a", "b"]), "V");
    expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
  });
});
