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

  it("parses --full flag", () => {
    const result = parseGlobalArgs(["inspect", "mention", "--full"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.full).toBe(true);
    }
  });

  it("parses provision-skills command", () => {
    const result = parseGlobalArgs(["provision-skills"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("provision-skills");
    }
  });

  it("parses --body flag", () => {
    const result = parseGlobalArgs(["inspect", "mention", "--body"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.body).toBe(true);
    }
  });

  it("--body defaults to false", () => {
    const result = parseGlobalArgs(["inspect", "mention"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.body).toBe(false);
    }
  });

  it("parses --dry-run flag", () => {
    const result = parseGlobalArgs(["provision-skills", "--dry-run"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.dryRun).toBe(true);
    }
  });

  it("--dry-run defaults to false", () => {
    const result = parseGlobalArgs(["provision-skills"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.dryRun).toBe(false);
    }
  });

  it("parses --body and --dry-run together", () => {
    const result = parseGlobalArgs(["inspect", "mention", "--body", "--dry-run"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.body).toBe(true);
      expect(result.options.dryRun).toBe(true);
    }
  });

  it("accepts --dry-run with non-provision commands", () => {
    const result = parseGlobalArgs(["inspect", "mention", "--dry-run"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("inspect");
      expect(result.options.dryRun).toBe(true);
    }
  });

  it("parses list-skills command", () => {
    const result = parseGlobalArgs(["list-skills"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("list-skills");
    }
  });

  it("parses --include", () => {
    const result = parseGlobalArgs(["provision-skills", "--include", "deploy"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.include).toEqual(["deploy"]);
    }
  });

  it("parses repeated --include", () => {
    const result = parseGlobalArgs([
      "provision-skills",
      "--include",
      "deploy",
      "--include",
      "review",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.include).toEqual(["deploy", "review"]);
    }
  });

  it("parses --exclude", () => {
    const result = parseGlobalArgs(["provision-skills", "--exclude", "draft-*"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.exclude).toEqual(["draft-*"]);
    }
  });

  it("--include defaults to empty array", () => {
    const result = parseGlobalArgs(["provision-skills"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.include).toEqual([]);
    }
  });

  it("--exclude defaults to empty array", () => {
    const result = parseGlobalArgs(["provision-skills"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.exclude).toEqual([]);
    }
  });

  it("rejects --include and --exclude together", () => {
    const result = parseGlobalArgs([
      "provision-skills",
      "--include",
      "deploy",
      "--exclude",
      "draft-*",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(2);
    }
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("parses list-agents command", () => {
    const result = parseGlobalArgs(["list-agents"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("list-agents");
    }
  });

  it("parses provision-agents command", () => {
    const result = parseGlobalArgs(["provision-agents"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("provision-agents");
    }
  });

  it("--include works with provision-agents", () => {
    const result = parseGlobalArgs(["provision-agents", "--include", "architect"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("provision-agents");
      expect(result.options.include).toEqual(["architect"]);
    }
  });

  it("--exclude works with provision-agents", () => {
    const result = parseGlobalArgs(["provision-agents", "--exclude", "draft-*"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("provision-agents");
      expect(result.options.exclude).toEqual(["draft-*"]);
    }
  });

  it("parses --description flag", () => {
    const result = parseGlobalArgs(["list-skills", "--description"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.description).toBe(true);
    }
  });

  it("--description defaults to false", () => {
    const result = parseGlobalArgs(["list-skills"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.description).toBe(false);
    }
  });

  it("--description works with list-agents", () => {
    const result = parseGlobalArgs(["list-agents", "--description"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("list-agents");
      expect(result.options.description).toBe(true);
    }
  });
});
