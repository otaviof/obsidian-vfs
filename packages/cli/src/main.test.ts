import { describe, expect, it, vi } from "vitest";

vi.mock("./formatters.js", () => ({
  formatUsageError: vi.fn((msg: string) => `USAGE: ${msg}`),
  formatHelp: vi.fn(() => "HELP"),
  writeStdout: vi.fn(),
  writeStderr: vi.fn(),
}));

import { writeStderr } from "./formatters.js";
import { parseGlobalArgs } from "./main.js";

const mockWriteStderr = vi.mocked(writeStderr);

describe("parseGlobalArgs", () => {
  it("parses inspect command", () => {
    const result = parseGlobalArgs(["inspect", "mention"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("inspect");
      expect(result.positionals).toEqual(["mention"]);
    }
  });

  it("parses resolve command", () => {
    const result = parseGlobalArgs(["resolve", "wikilink"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("resolve");
      expect(result.positionals).toEqual(["wikilink"]);
    }
  });

  it("parses --json flag", () => {
    const result = parseGlobalArgs(["inspect", "mention", "--json"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.json).toBe(true);
    }
  });

  it("parses -v short flag", () => {
    const result = parseGlobalArgs(["resolve", "wikilink", "-v"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.verbose).toBe(true);
    }
  });

  it("parses --verbose long flag", () => {
    const result = parseGlobalArgs(["resolve", "wikilink", "--verbose"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.verbose).toBe(true);
    }
  });

  it("parses --cli-path", () => {
    const result = parseGlobalArgs(["inspect", "mention", "--cli-path", "/usr/bin/obsidian"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.cliPath).toBe("/usr/bin/obsidian");
    }
  });

  it("parses --timeout", () => {
    const result = parseGlobalArgs(["inspect", "mention", "--timeout", "5000"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.timeoutMs).toBe(5000);
    }
  });

  it("defaults --cli-path to 'obsidian'", () => {
    const result = parseGlobalArgs(["inspect", "mention"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.cliPath).toBe("obsidian");
    }
  });

  it("defaults --timeout to 10000", () => {
    const result = parseGlobalArgs(["inspect", "mention"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.timeoutMs).toBe(10000);
    }
  });

  it("shows help when no command given", () => {
    const result = parseGlobalArgs([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("help");
    }
  });

  it("shows help with --help flag", () => {
    const result = parseGlobalArgs(["--help"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("help");
    }
  });

  it("shows help with -h flag", () => {
    const result = parseGlobalArgs(["-h"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("help");
    }
  });

  it("returns usage error for unknown command", () => {
    const result = parseGlobalArgs(["unknown"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(2);
    }
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("returns usage error for unknown flag", () => {
    const result = parseGlobalArgs(["--bogus"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(2);
    }
  });

  it("returns usage error for invalid timeout", () => {
    const result = parseGlobalArgs(["inspect", "m", "--timeout", "abc"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(2);
    }
  });

  it("returns usage error for zero timeout", () => {
    const result = parseGlobalArgs(["inspect", "m", "--timeout", "0"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(2);
    }
  });

  it("returns usage error for negative timeout", () => {
    const result = parseGlobalArgs(["inspect", "m", "--timeout", "-1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(2);
    }
  });

  it("parses --full flag", () => {
    const result = parseGlobalArgs(["inspect", "mention", "--full"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.full).toBe(true);
    }
  });
});
