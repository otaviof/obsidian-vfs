import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

import { ERR, ERRNO } from "./types.js";
import type { VFSResult } from "./types.js";
import { resolveCliPath } from "./resolve-cli-path.js";

const execFile = promisify(execFileCb);

/** Default timeout for CLI operations in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 10_000;

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

/** Resolve CLI execution options from environment variables with validated defaults. */
export function resolveExecConfig(env: Record<string, string | undefined>): CLIExecOptions {
  const cliPath = resolveCliPath({ env });

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const rawTimeout = env.OBSIDIAN_VFS_TIMEOUT_MS;
  if (rawTimeout !== undefined) {
    const parsed = Number.parseInt(rawTimeout, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      timeoutMs = parsed;
    }
  }

  return Object.freeze({ cliPath, timeoutMs });
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
        error: { code: ERR.TIMEOUT, message: `CLI timed out after ${options.timeoutMs}ms` },
      };
    }
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === ERRNO.ENOENT
    ) {
      return {
        ok: false,
        error: {
          code: ERR.CLI_UNAVAILABLE,
          message: `CLI binary not found: ${options.cliPath}`,
        },
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: ERR.CLI_ERROR, message } };
  } finally {
    clearTimeout(timer);
  }
}
