import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

import type { VFSResult } from "./types.js";

const execFile = promisify(execFileCb);

/**
 * Options for CLI execution. Timeout and binary path.
 */
export interface CLIExecOptions {
  readonly timeoutMs: number;
  readonly cliPath: string;
}

/**
 * CLI execution output, stdout and stderr streams.
 */
export interface CLIExecResult {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Spawns the Obsidian CLI with given args, applying timeout and signal handling.
 * Maps ENOENT → CLI_UNAVAILABLE, AbortError → TIMEOUT, generic → CLI_ERROR.
 */
export async function execCLI(
  args: readonly string[],
  options: CLIExecOptions,
): Promise<VFSResult<CLIExecResult>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), options.timeoutMs);

  try {
    const { stdout, stderr } = await execFile(options.cliPath, [...args], {
      signal: ac.signal,
    });
    return { ok: true, value: { stdout, stderr } };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: { code: "TIMEOUT", message: `CLI timed out after ${options.timeoutMs}ms` },
      };
    }
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ok: false,
        error: {
          code: "CLI_UNAVAILABLE",
          message: `CLI binary not found: ${options.cliPath}`,
        },
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: "CLI_ERROR", message } };
  } finally {
    clearTimeout(timer);
  }
}
