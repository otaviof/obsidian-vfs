import { describe, expect, it, vi } from "vitest";

import { createVscodeMock } from "./test-mocks.js";

vi.mock("vscode", () => createVscodeMock({ fileSystemError: true }));

import * as vscode from "vscode";

import { throwFileExists, throwVFSError } from "./error-mapper.js";

// eslint-disable-next-line @typescript-eslint/unbound-method
const mockFileNotFound = vi.mocked(vscode.FileSystemError.FileNotFound);
// eslint-disable-next-line @typescript-eslint/unbound-method
const mockNoPermissions = vi.mocked(vscode.FileSystemError.NoPermissions);
// eslint-disable-next-line @typescript-eslint/unbound-method
const mockUnavailable = vi.mocked(vscode.FileSystemError.Unavailable);
// eslint-disable-next-line @typescript-eslint/unbound-method
const mockFileExists = vi.mocked(vscode.FileSystemError.FileExists);

const fakeErrorUri = { toString: () => "obs://vault/file.md" } as never;

describe("throwVFSError", () => {
  it("throws FileNotFound for FILE_NOT_FOUND", () => {
    const result = {
      ok: false as const,
      error: { code: "FILE_NOT_FOUND" as const, message: "gone" },
    };
    expect(() => throwVFSError(result, fakeErrorUri)).toThrow("FileNotFound");
    expect(mockFileNotFound).toHaveBeenCalledWith(fakeErrorUri);
  });

  it("throws NoPermissions for PERMISSION_DENIED", () => {
    const result = {
      ok: false as const,
      error: { code: "PERMISSION_DENIED" as const, message: "denied" },
    };
    expect(() => throwVFSError(result, fakeErrorUri)).toThrow("NoPermissions");
    expect(mockNoPermissions).toHaveBeenCalledWith(fakeErrorUri);
  });

  it("throws NoPermissions for NOT_IMPLEMENTED", () => {
    const result = {
      ok: false as const,
      error: { code: "NOT_IMPLEMENTED" as const, message: "not yet" },
    };
    expect(() => throwVFSError(result, fakeErrorUri)).toThrow("NoPermissions");
    expect(mockNoPermissions).toHaveBeenCalledWith("not yet");
  });

  it("throws Unavailable for CLI_UNAVAILABLE", () => {
    const result = {
      ok: false as const,
      error: { code: "CLI_UNAVAILABLE" as const, message: "missing" },
    };
    expect(() => throwVFSError(result, fakeErrorUri)).toThrow("Unavailable");
    expect(mockUnavailable).toHaveBeenCalledWith(fakeErrorUri);
  });

  it("throws Unavailable for unknown error codes", () => {
    const result = {
      ok: false as const,
      error: { code: "PARSE_ERROR" as const, message: "bad data" },
    };
    expect(() => throwVFSError(result, fakeErrorUri)).toThrow("Unavailable");
  });
});

describe("throwFileExists", () => {
  it("throws FileExists error", () => {
    expect(() => throwFileExists(fakeErrorUri)).toThrow("FileExists");
    expect(mockFileExists).toHaveBeenCalledWith(fakeErrorUri);
  });
});
