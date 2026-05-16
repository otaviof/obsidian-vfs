import { beforeEach, describe, expect, it, vi } from "vitest";

import { ObsidianCLIImpl } from "./obsidian-cli.js";

vi.mock("./exec.js", () => ({
  execCLI: vi.fn(),
}));

const { execCLI } = await import("./exec.js");
const execCLIMock = vi.mocked(execCLI);

describe("ObsidianCLIImpl", () => {
  let cli: ObsidianCLIImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    cli = new ObsidianCLIImpl({
      cliPath: "/usr/local/bin/obsidian",
      timeoutMs: 5000,
    });
  });

  describe("method dispatch", () => {
    it.each([
      {
        label: "vaultPath",
        call: (c: ObsidianCLIImpl) => c.vaultPath(),
        stdout: "/vault/path",
        expectedArgs: ["vault", "info=path"],
        expectedResult: { ok: true, value: "/vault/path" },
      },
      {
        label: "vaultName",
        call: (c: ObsidianCLIImpl) => c.vaultName(),
        stdout: "MyVault",
        expectedArgs: ["vault", "info=name"],
        expectedResult: { ok: true, value: "MyVault" },
      },
      {
        label: "dailyPath",
        call: (c: ObsidianCLIImpl) => c.dailyPath(),
        stdout: "/vault/daily/2026-05-01.md",
        expectedArgs: ["daily", "info=path"],
        expectedResult: { ok: true, value: "/vault/daily/2026-05-01.md" },
      },
      {
        label: "propertyRead",
        call: (c: ObsidianCLIImpl) => c.propertyRead("note.md", "title"),
        stdout: "property-value",
        expectedArgs: ["property-read", "note.md", "title"],
        expectedResult: { ok: true, value: "property-value" },
      },
      {
        label: "files (no folder)",
        call: (c: ObsidianCLIImpl) => c.files(),
        stdout: "a.md\nb.md",
        expectedArgs: ["files"],
        expectedResult: { ok: true, value: ["a.md", "b.md"] },
      },
      {
        label: "files (with folder)",
        call: (c: ObsidianCLIImpl) => c.files("folder"),
        stdout: "c.md",
        expectedArgs: ["files", "folder"],
        expectedResult: { ok: true, value: ["c.md"] },
      },
      {
        label: "folders (no parent)",
        call: (c: ObsidianCLIImpl) => c.folders(),
        stdout: "folder1\nfolder2",
        expectedArgs: ["folders"],
        expectedResult: { ok: true, value: ["folder1", "folder2"] },
      },
      {
        label: "folders (with parent)",
        call: (c: ObsidianCLIImpl) => c.folders("parent"),
        stdout: "subfolder",
        expectedArgs: ["folders", "parent"],
        expectedResult: { ok: true, value: ["subfolder"] },
      },
      {
        label: "links",
        call: (c: ObsidianCLIImpl) => c.links("source.md"),
        stdout: "link1.md\nlink2.md",
        expectedArgs: ["links", "source.md"],
        expectedResult: { ok: true, value: ["link1.md", "link2.md"] },
      },
      {
        label: "tags (no opts)",
        call: (c: ObsidianCLIImpl) => c.tags(),
        stdout: "#tag1\n#tag2",
        expectedArgs: ["tags"],
        expectedResult: { ok: true, value: ["#tag1", "#tag2"] },
      },
      {
        label: "tags (sort=count)",
        call: (c: ObsidianCLIImpl) => c.tags({ sort: "count" }),
        stdout: "#tag1\n#tag2",
        expectedArgs: ["tags", "sort=count"],
        expectedResult: { ok: true, value: ["#tag1", "#tag2"] },
      },
      {
        label: "search (no opts)",
        call: (c: ObsidianCLIImpl) => c.search("query"),
        stdout: JSON.stringify([{ file: "note.md", matches: [] }]),
        expectedArgs: ["search", "query=query", "format=json"],
        expectedResult: { ok: true, value: ["note.md"] },
      },
      {
        label: "search (with opts)",
        call: (c: ObsidianCLIImpl) =>
          c.search("query", { path: "folder", limit: 10, contextLength: 5 }),
        stdout: JSON.stringify([{ file: "note.md", matches: [] }]),
        expectedArgs: [
          "search",
          "query=query",
          "format=json",
          "path=folder",
          "limit=10",
          "context-length=5",
        ],
        expectedResult: { ok: true, value: ["note.md"] },
      },
      {
        label: "searchContext",
        call: (c: ObsidianCLIImpl) => c.searchContext("query"),
        stdout: JSON.stringify([{ file: "note.md", matches: [{ line: 1, text: "hello" }] }]),
        expectedArgs: ["search", "query=query", "format=json"],
        expectedResult: {
          ok: true,
          value: [{ file: "note.md", matches: [{ line: 1, text: "hello" }] }],
        },
      },
      {
        label: "searchContext (with opts)",
        call: (c: ObsidianCLIImpl) =>
          c.searchContext("query", { path: "notes", limit: 5, contextLength: 3 }),
        stdout: JSON.stringify([]),
        expectedArgs: [
          "search",
          "query=query",
          "format=json",
          "path=notes",
          "limit=5",
          "context-length=3",
        ],
        expectedResult: { ok: true, value: [] },
      },
      {
        label: "backlinks",
        call: (c: ObsidianCLIImpl) => c.backlinks("target.md"),
        stdout: JSON.stringify([{ file: "note1.md" }, { file: "note2.md" }]),
        expectedArgs: ["backlinks", "target.md"],
        expectedResult: { ok: true, value: [{ file: "note1.md" }, { file: "note2.md" }] },
      },
    ])(
      "$label: builds correct args and parses output",
      async ({ call, stdout, expectedArgs, expectedResult }) => {
        execCLIMock.mockResolvedValue({
          ok: true,
          value: { stdout, stderr: "" },
        });

        const result = await call(cli);

        expect(execCLIMock).toHaveBeenCalledWith(expectedArgs, expect.any(Object));
        expect(result).toEqual(expectedResult);
      },
    );
  });

  describe("error propagation", () => {
    it("propagates CLI errors from vaultPath", async () => {
      execCLIMock.mockResolvedValue({
        ok: false,
        error: { code: "CLI_UNAVAILABLE", message: "not found" },
      });

      const result = await cli.vaultPath();

      expect(result).toEqual({
        ok: false,
        error: { code: "CLI_UNAVAILABLE", message: "not found" },
      });
    });
  });

  describe("isAvailable", () => {
    it("bypasses queue and returns true when CLI succeeds", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "/vault", stderr: "" },
      });

      const result = await cli.isAvailable();

      expect(result).toBe(true);
      expect(execCLIMock).toHaveBeenCalledWith(["vault", "info=path"], expect.any(Object));
    });

    it("returns false when CLI fails", async () => {
      execCLIMock.mockResolvedValue({
        ok: false,
        error: { code: "CLI_UNAVAILABLE", message: "not found" },
      });

      const result = await cli.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe("queue serialization", () => {
    it("executes calls sequentially", async () => {
      const order: number[] = [];
      let callCount = 0;
      let releaseGate: (() => void) | undefined;
      const gate = new Promise<void>((r) => {
        releaseGate = r;
      });

      execCLIMock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) await gate;
        order.push(callCount);
        return { ok: true as const, value: { stdout: "ok", stderr: "" } };
      });

      const promise1 = cli.vaultPath();
      const promise2 = cli.vaultName();

      releaseGate!();
      await Promise.all([promise1, promise2]);

      expect(order).toEqual([1, 2]);
    });
  });

  describe("isAvailable queue bypass", () => {
    it("resolves while a queued operation is still pending", async () => {
      let callCount = 0;
      let releaseGate: (() => void) | undefined;
      const gate = new Promise<void>((r) => {
        releaseGate = r;
      });

      execCLIMock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) await gate;
        return { ok: true as const, value: { stdout: "/vault", stderr: "" } };
      });

      const queued = cli.vaultPath();
      await Promise.resolve();
      const available = await cli.isAvailable();

      expect(available).toBe(true);
      expect(callCount).toBe(2);

      releaseGate!();
      await queued;
    });
  });

  describe("open", () => {
    it("builds correct args and returns success", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "", stderr: "" },
      });

      const result = await cli.open("note.md");

      expect(execCLIMock).toHaveBeenCalledWith(["open", "path=note.md"], expect.any(Object));
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it("passes newtab flag", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "", stderr: "" },
      });

      await cli.open("note.md", true);

      expect(execCLIMock).toHaveBeenCalledWith(
        ["open", "path=note.md", "newtab"],
        expect.any(Object),
      );
    });

    it("propagates CLI errors", async () => {
      execCLIMock.mockResolvedValue({
        ok: false,
        error: { code: "CLI_UNAVAILABLE", message: "not found" },
      });

      const result = await cli.open("note.md");

      expect(result).toEqual({
        ok: false,
        error: { code: "CLI_UNAVAILABLE", message: "not found" },
      });
    });

    it("detects Error: stdout prefix", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "Error: file not found", stderr: "" },
      });

      const result = await cli.open("missing.md");

      expect(result).toEqual({
        ok: false,
        error: {
          code: "CLI_ERROR",
          message: "Error: file not found",
          command: "open path=missing.md",
        },
      });
    });
  });
});
