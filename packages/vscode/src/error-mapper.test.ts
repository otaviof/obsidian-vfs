import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  FileSystemError: {
    FileNotFound: vi.fn((uri: unknown) => new Error(`FileNotFound: ${String(uri)}`)),
    NoPermissions: vi.fn((msg: unknown) => new Error(`NoPermissions: ${String(msg)}`)),
    Unavailable: vi.fn((uri: unknown) => new Error(`Unavailable: ${String(uri)}`)),
    FileExists: vi.fn((uri: unknown) => new Error(`FileExists: ${String(uri)}`)),
  },
}));

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

const fakeUri = { toString: () => "obs://vault/file.md" } as never;

describe("throwVFSError", () => {
  it("throws FileNotFound for FILE_NOT_FOUND", () => {
    const result = {
      ok: false as const,
      error: { code: "FILE_NOT_FOUND" as const, message: "gone" },
    };
    expect(() => throwVFSError(result, fakeUri)).toThrow("FileNotFound");
    expect(mockFileNotFound).toHaveBeenCalledWith(fakeUri);
  });

  it("throws NoPermissions for PERMISSION_DENIED", () => {
    const result = {
      ok: false as const,
      error: { code: "PERMISSION_DENIED" as const, message: "denied" },
    };
    expect(() => throwVFSError(result, fakeUri)).toThrow("NoPermissions");
    expect(mockNoPermissions).toHaveBeenCalledWith(fakeUri);
  });

  it("throws NoPermissions for NOT_IMPLEMENTED", () => {
    const result = {
      ok: false as const,
      error: { code: "NOT_IMPLEMENTED" as const, message: "not yet" },
    };
    expect(() => throwVFSError(result, fakeUri)).toThrow("NoPermissions");
    expect(mockNoPermissions).toHaveBeenCalledWith("not yet");
  });

  it("throws Unavailable for CLI_UNAVAILABLE", () => {
    const result = {
      ok: false as const,
      error: { code: "CLI_UNAVAILABLE" as const, message: "missing" },
    };
    expect(() => throwVFSError(result, fakeUri)).toThrow("Unavailable");
    expect(mockUnavailable).toHaveBeenCalledWith(fakeUri);
  });

  it("throws Unavailable for unknown error codes", () => {
    const result = {
      ok: false as const,
      error: { code: "PARSE_ERROR" as const, message: "bad data" },
    };
    expect(() => throwVFSError(result, fakeUri)).toThrow("Unavailable");
  });
});

describe("throwFileExists", () => {
  it("throws FileExists error", () => {
    expect(() => throwFileExists(fakeUri)).toThrow("FileExists");
    expect(mockFileExists).toHaveBeenCalledWith(fakeUri);
  });
});
