import type { BacklinkEntry, SearchMatch } from "./cli.js";
import type { VFSResult } from "./types.js";

function isSearchMatch(v: unknown): v is SearchMatch {
  return (
    typeof v === "object" && v !== null && "file" in v && typeof (v as SearchMatch).file === "string"
  );
}

function isBacklinkEntry(v: unknown): v is BacklinkEntry {
  return (
    typeof v === "object" &&
    v !== null &&
    "file" in v &&
    typeof (v as BacklinkEntry).file === "string"
  );
}

/**
 * Detects CLI error by checking if stdout starts with "Error:". Returns error result if found,
 * undefined otherwise.
 */
export function detectCLIError<T>(stdout: string, command: string): VFSResult<T> | undefined {
  if (stdout.startsWith("Error:")) {
    return { ok: false, error: { code: "CLI_ERROR", message: stdout, command } };
  }
  return undefined;
}

/**
 * Parses stdout as a single trimmed string. Returns PARSE_ERROR if empty.
 */
export function parseSingleValue(stdout: string, command: string): VFSResult<string> {
  const err = detectCLIError<string>(stdout, command);
  if (err) return err;

  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: { code: "PARSE_ERROR", message: "Empty output", command } };
  }
  return { ok: true, value: trimmed };
}

/**
 * Parses stdout as newline-delimited list of strings. Filters empty lines.
 */
export function parseLineList(stdout: string, command: string): VFSResult<string[]> {
  const err = detectCLIError<string[]>(stdout, command);
  if (err) return err;

  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return { ok: true, value: lines };
}

/**
 * Parses stdout as JSON array of SearchMatch objects. Returns PARSE_ERROR for
 * invalid JSON or non-array.
 */
export function parseSearchJSON(stdout: string, command: string): VFSResult<SearchMatch[]> {
  const err: VFSResult<SearchMatch[]> | undefined = detectCLIError<SearchMatch[]>(stdout, command);
  if (err) return err;

  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed) || !parsed.every(isSearchMatch)) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: "Expected SearchMatch[]", command },
      };
    }
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "Invalid JSON", command },
    };
  }
}

/**
 * Parses stdout as JSON array of BacklinkEntry objects. Returns PARSE_ERROR for
 * invalid JSON or non-array.
 */
export function parseBacklinksJSON(stdout: string, command: string): VFSResult<BacklinkEntry[]> {
  const err: VFSResult<BacklinkEntry[]> | undefined = detectCLIError<BacklinkEntry[]>(
    stdout,
    command,
  );
  if (err) return err;

  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed) || !parsed.every(isBacklinkEntry)) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: "Expected BacklinkEntry[]", command },
      };
    }
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "Invalid JSON", command },
    };
  }
}

/**
 * Parses stdout as JSON array of SearchMatch, then extracts file paths.
 */
export function parseSearchFiles(stdout: string, command: string): VFSResult<string[]> {
  const err: VFSResult<string[]> | undefined = detectCLIError<string[]>(stdout, command);
  if (err) return err;

  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed) || !parsed.every(isSearchMatch)) {
      return {
        ok: false,
        error: { code: "PARSE_ERROR", message: "Expected SearchMatch[]", command },
      };
    }
    const files = parsed.map((m) => m.file);
    return { ok: true, value: files };
  } catch {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: "Invalid JSON", command },
    };
  }
}
