import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./formatters.js", () => ({
  formatUsageError: vi.fn((msg: string) => `USAGE: ${msg}`),
  formatHelp: vi.fn(() => "HELP"),
  writeStdout: vi.fn(),
  writeStderr: vi.fn(),
}));

vi.mock("./cmd-inspect.js", () => ({ run: vi.fn().mockResolvedValue(0) }));
vi.mock("./cmd-resolve.js", () => ({ run: vi.fn().mockResolvedValue(0) }));
vi.mock("./cmd-list-skills.js", () => ({ run: vi.fn().mockResolvedValue(0) }));
vi.mock("./cmd-list-agents.js", () => ({ run: vi.fn().mockResolvedValue(0) }));
vi.mock("./cmd-provision-skills.js", () => ({ run: vi.fn().mockResolvedValue(0) }));
vi.mock("./cmd-provision-agents.js", () => ({ run: vi.fn().mockResolvedValue(0) }));

import { writeStderr, writeStdout } from "./formatters.js";
import { run as runInspect } from "./cmd-inspect.js";
import { run as runResolve } from "./cmd-resolve.js";
import { run as runListSkills } from "./cmd-list-skills.js";
import { run as runListAgents } from "./cmd-list-agents.js";
import { run as runProvisionSkills } from "./cmd-provision-skills.js";
import { run as runProvisionAgents } from "./cmd-provision-agents.js";
import {
  buildInspectArgs,
  buildListResourcesArgs,
  buildProvisionArgs,
  buildResolveArgs,
  dispatch,
  parseGlobalArgs,
} from "./main.js";
import type { CLIOptions } from "./types.js";

const mockWriteStderr = vi.mocked(writeStderr);
const mockWriteStdout = vi.mocked(writeStdout);

function makeCLIOptions(overrides: Partial<CLIOptions> = {}): CLIOptions {
  return {
    command: "help",
    json: false,
    verbose: false,
    full: false,
    body: false,
    description: false,
    dryRun: false,
    include: [],
    exclude: [],
    pin: false,
    user: false,
    set: [],
    unset: [],
    ...overrides,
  };
}

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

  it("defaults all flags correctly", () => {
    const result = parseGlobalArgs(["inspect", "mention"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options).toEqual(
        expect.objectContaining({
          json: false,
          verbose: false,
          full: false,
          body: false,
          description: false,
          dryRun: false,
          pin: false,
          user: false,
          include: [],
          exclude: [],
          set: [],
          unset: [],
        }),
      );
    }
  });

  it("parses --dry-run flag", () => {
    const result = parseGlobalArgs(["provision-skills", "--dry-run"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.dryRun).toBe(true);
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

  it("--description works with list-agents", () => {
    const result = parseGlobalArgs(["list-agents", "--description"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("list-agents");
      expect(result.options.description).toBe(true);
    }
  });

  it("parses --pin flag", () => {
    const result = parseGlobalArgs(["provision-skills", "--pin"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.pin).toBe(true);
    }
  });

  it("--pin works with provision-agents", () => {
    const result = parseGlobalArgs(["provision-agents", "--pin"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("provision-agents");
      expect(result.options.pin).toBe(true);
    }
  });

  it("parses --user flag", () => {
    const result = parseGlobalArgs(["provision-agents", "--user"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.user).toBe(true);
    }
  });

  it("--user works with provision-skills", () => {
    const result = parseGlobalArgs(["provision-skills", "--user"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.command).toBe("provision-skills");
      expect(result.options.user).toBe(true);
    }
  });

  it("parses --set model=opus", () => {
    const result = parseGlobalArgs(["provision-skills", "--set", "model=opus"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.set).toEqual(["model=opus"]);
    }
  });

  it("parses --unset model", () => {
    const result = parseGlobalArgs(["provision-agents", "--unset", "model"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.unset).toEqual(["model"]);
    }
  });

  it("parses multiple --set and --unset flags", () => {
    const result = parseGlobalArgs([
      "provision-agents",
      "--set",
      "model=opus",
      "--set",
      "allowed-tools=Bash",
      "--unset",
      "argument-hint",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.set).toEqual(["model=opus", "allowed-tools=Bash"]);
      expect(result.options.unset).toEqual(["argument-hint"]);
    }
  });
});

describe("dispatch", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("help writes help text and returns EXIT_SUCCESS", async () => {
    const code = await dispatch(makeCLIOptions({ command: "help" }), []);

    expect(code).toBe(0);
    expect(mockWriteStdout).toHaveBeenCalledWith("HELP");
  });

  it("inspect dispatches to runInspect with correct args", async () => {
    const opts = makeCLIOptions({ command: "inspect", json: true, verbose: true, full: true });
    await dispatch(opts, ["my-mention"]);

    expect(vi.mocked(runInspect)).toHaveBeenCalledWith({
      mention: "my-mention",
      json: true,
      verbose: true,
      full: true,
      body: false,
    });
  });

  it("inspect without positional returns EXIT_USAGE", async () => {
    const code = await dispatch(makeCLIOptions({ command: "inspect" }), []);

    expect(code).toBe(2);
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("resolve dispatches to runResolve with correct args", async () => {
    const opts = makeCLIOptions({ command: "resolve", json: true });
    await dispatch(opts, ["my-wikilink"]);

    expect(vi.mocked(runResolve)).toHaveBeenCalledWith({
      wikilink: "my-wikilink",
      json: true,
      verbose: false,
    });
  });

  it("resolve without positional returns EXIT_USAGE", async () => {
    const code = await dispatch(makeCLIOptions({ command: "resolve" }), []);

    expect(code).toBe(2);
  });

  it("list-skills dispatches to runListSkills", async () => {
    const opts = makeCLIOptions({ command: "list-skills", description: true });
    await dispatch(opts, []);

    expect(vi.mocked(runListSkills)).toHaveBeenCalledWith({
      json: false,
      verbose: false,
      description: true,
    });
  });

  it("list-agents dispatches to runListAgents", async () => {
    const opts = makeCLIOptions({ command: "list-agents", json: true });
    await dispatch(opts, []);

    expect(vi.mocked(runListAgents)).toHaveBeenCalledWith({
      json: true,
      verbose: false,
      description: false,
    });
  });

  it("provision-skills dispatches to runProvisionSkills", async () => {
    const opts = makeCLIOptions({ command: "provision-skills", dryRun: true, pin: true });
    await dispatch(opts, []);

    expect(vi.mocked(runProvisionSkills)).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, pin: true }),
    );
  });

  it("provision-agents dispatches to runProvisionAgents", async () => {
    const opts = makeCLIOptions({ command: "provision-agents", user: true });
    await dispatch(opts, []);

    expect(vi.mocked(runProvisionAgents)).toHaveBeenCalledWith(
      expect.objectContaining({ user: true }),
    );
  });
});

describe("buildInspectArgs", () => {
  it("returns null and writes usage error when no positional", () => {
    const opts = makeCLIOptions({ command: "inspect" });
    expect(buildInspectArgs(opts, [])).toBeNull();
    expect(mockWriteStderr).toHaveBeenCalled();
  });

  it("builds args from options and positional", () => {
    const opts = makeCLIOptions({ command: "inspect", json: true, body: true });
    expect(buildInspectArgs(opts, ["mention"])).toEqual({
      mention: "mention",
      json: true,
      verbose: false,
      full: false,
      body: true,
    });
  });
});

describe("buildResolveArgs", () => {
  it("returns null when no positional", () => {
    const opts = makeCLIOptions({ command: "resolve" });
    expect(buildResolveArgs(opts, [])).toBeNull();
  });

  it("builds args from options and positional", () => {
    const opts = makeCLIOptions({ command: "resolve", verbose: true });
    expect(buildResolveArgs(opts, ["link"])).toEqual({
      wikilink: "link",
      json: false,
      verbose: true,
    });
  });
});

describe("buildListResourcesArgs", () => {
  it("extracts json, verbose, description from options", () => {
    const opts = makeCLIOptions({ description: true, json: true });
    expect(buildListResourcesArgs(opts)).toEqual({
      json: true,
      verbose: false,
      description: true,
    });
  });
});

describe("buildProvisionArgs", () => {
  it("extracts all provision-relevant fields from options", () => {
    const opts = makeCLIOptions({
      dryRun: true,
      pin: true,
      user: true,
      include: ["a"],
      set: ["model=opus"],
    });
    expect(buildProvisionArgs(opts)).toEqual({
      dryRun: true,
      json: false,
      verbose: false,
      include: ["a"],
      exclude: [],
      pin: true,
      user: true,
      set: ["model=opus"],
      unset: [],
    });
  });
});
