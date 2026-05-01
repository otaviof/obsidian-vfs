import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CLIExecOptions } from "../exec.js";
import { execCLI } from "../exec.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const { execFile } = await import("node:child_process");

type ExecCallback = (err: Error | null, result: { stdout: string; stderr: string }) => void;

const execFileMock = vi.mocked(execFile as unknown as (...args: unknown[]) => unknown);

function mockSuccess(stdout: string, stderr = "") {
  execFileMock.mockImplementation((...args: unknown[]) => {
    const cb = args.at(-1) as ExecCallback;
    cb(null, { stdout, stderr });
  });
}

function mockFailure(err: Error) {
  execFileMock.mockImplementation((...args: unknown[]) => {
    const cb = args.at(-1) as ExecCallback;
    cb(err, { stdout: "", stderr: "" });
  });
}

describe("execCLI", () => {
  const baseOptions: CLIExecOptions = {
    timeoutMs: 5000,
    cliPath: "/usr/local/bin/obsidian-cli",
    vaultPath: "/vault",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:true with stdout and stderr on success", async () => {
    mockSuccess("output", "");

    const result = await execCLI(["vault", "info=path"], baseOptions);

    expect(result).toEqual({
      ok: true,
      value: { stdout: "output", stderr: "" },
    });
  });

  it("returns CLI_UNAVAILABLE when ENOENT error occurs", async () => {
    const enoentError = new Error("ENOENT") as NodeJS.ErrnoException;
    enoentError.code = "ENOENT";
    mockFailure(enoentError);

    const result = await execCLI(["vault", "info=path"], baseOptions);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CLI_UNAVAILABLE",
        message: "CLI binary not found: /usr/local/bin/obsidian-cli",
      },
    });
  });

  it("returns TIMEOUT when AbortError occurs", async () => {
    const abortError = new Error("AbortError");
    abortError.name = "AbortError";
    mockFailure(abortError);

    const result = await execCLI(["vault", "info=path"], baseOptions);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "TIMEOUT",
        message: "CLI timed out after 5000ms",
      },
    });
  });

  it("returns CLI_ERROR for generic errors", async () => {
    mockFailure(new Error("generic error"));

    const result = await execCLI(["vault", "info=path"], baseOptions);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CLI_ERROR",
        message: "generic error",
      },
    });
  });

  it("passes args correctly to execFile", async () => {
    mockSuccess("ok");

    await execCLI(["search", "query", "format=json"], baseOptions);

    expect(execFileMock).toHaveBeenCalledWith(
      "/usr/local/bin/obsidian-cli",
      ["search", "query", "format=json"],
      expect.objectContaining({ cwd: "/vault" }),
      expect.any(Function),
    );
  });

  it("attaches AbortController signal to execFile", async () => {
    let capturedSignal: AbortSignal | undefined;

    execFileMock.mockImplementation((...args: unknown[]) => {
      const opts = args[2] as { signal?: AbortSignal };
      capturedSignal = opts.signal;
      const cb = args.at(-1) as ExecCallback;
      cb(null, { stdout: "ok", stderr: "" });
    });

    await execCLI(["vault", "info=path"], baseOptions);

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});
