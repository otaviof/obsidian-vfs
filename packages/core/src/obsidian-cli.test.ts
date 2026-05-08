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

  describe("vaultPath", () => {
    it("builds correct args and parses single value", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "/vault/path", stderr: "" },
      });

      const result = await cli.vaultPath();

      expect(execCLIMock).toHaveBeenCalledWith(["vault", "info=path"], expect.any(Object));
      expect(result).toEqual({ ok: true, value: "/vault/path" });
    });

    it("propagates CLI errors", async () => {
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

  describe("vaultName", () => {
    it("builds correct args and parses single value", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "MyVault", stderr: "" },
      });

      const result = await cli.vaultName();

      expect(execCLIMock).toHaveBeenCalledWith(["vault", "info=name"], expect.any(Object));
      expect(result).toEqual({ ok: true, value: "MyVault" });
    });
  });

  describe("search", () => {
    it("builds args without opts", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: {
          stdout: JSON.stringify([{ file: "note.md", matches: [] }]),
          stderr: "",
        },
      });

      const result = await cli.search("query");

      expect(execCLIMock).toHaveBeenCalledWith(
        ["search", "query=query", "format=json"],
        expect.any(Object),
      );
      expect(result).toEqual({ ok: true, value: ["note.md"] });
    });

    it("builds args with path, limit, and contextLength", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: {
          stdout: JSON.stringify([{ file: "note.md", matches: [] }]),
          stderr: "",
        },
      });

      await cli.search("query", { path: "folder", limit: 10, contextLength: 5 });

      expect(execCLIMock).toHaveBeenCalledWith(
        ["search", "query=query", "format=json", "path=folder", "limit=10", "context-length=5"],
        expect.any(Object),
      );
    });
  });

  describe("searchContext", () => {
    it("builds args and parses SearchMatch[]", async () => {
      const matches = [{ file: "note.md", matches: [{ line: 1, text: "hello" }] }];
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: JSON.stringify(matches), stderr: "" },
      });

      const result = await cli.searchContext("query");

      expect(execCLIMock).toHaveBeenCalledWith(
        ["search", "query=query", "format=json"],
        expect.any(Object),
      );
      expect(result).toEqual({ ok: true, value: matches });
    });

    it("builds args with opts", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: JSON.stringify([]), stderr: "" },
      });

      await cli.searchContext("query", { path: "notes", limit: 5, contextLength: 3 });

      expect(execCLIMock).toHaveBeenCalledWith(
        ["search", "query=query", "format=json", "path=notes", "limit=5", "context-length=3"],
        expect.any(Object),
      );
    });
  });

  describe("files", () => {
    it("builds args without folder", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "a.md\nb.md", stderr: "" },
      });

      const result = await cli.files();

      expect(execCLIMock).toHaveBeenCalledWith(["files"], expect.any(Object));
      expect(result).toEqual({ ok: true, value: ["a.md", "b.md"] });
    });

    it("builds args with folder", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "c.md", stderr: "" },
      });

      await cli.files("folder");

      expect(execCLIMock).toHaveBeenCalledWith(["files", "folder"], expect.any(Object));
    });
  });

  describe("folders", () => {
    it("builds args without parent folder", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "folder1\nfolder2", stderr: "" },
      });

      const result = await cli.folders();

      expect(execCLIMock).toHaveBeenCalledWith(["folders"], expect.any(Object));
      expect(result).toEqual({ ok: true, value: ["folder1", "folder2"] });
    });

    it("builds args with parent folder", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "subfolder", stderr: "" },
      });

      await cli.folders("parent");

      expect(execCLIMock).toHaveBeenCalledWith(["folders", "parent"], expect.any(Object));
    });
  });

  describe("backlinks", () => {
    it("builds args and parses BacklinkEntry[]", async () => {
      const backlinks = [{ file: "note1.md" }, { file: "note2.md" }];
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: JSON.stringify(backlinks), stderr: "" },
      });

      const result = await cli.backlinks("target.md");

      expect(execCLIMock).toHaveBeenCalledWith(["backlinks", "target.md"], expect.any(Object));
      expect(result).toEqual({ ok: true, value: backlinks });
    });
  });

  describe("links", () => {
    it("builds args and parses line list", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "link1.md\nlink2.md", stderr: "" },
      });

      const result = await cli.links("source.md");

      expect(execCLIMock).toHaveBeenCalledWith(["links", "source.md"], expect.any(Object));
      expect(result).toEqual({ ok: true, value: ["link1.md", "link2.md"] });
    });
  });

  describe("dailyPath", () => {
    it("builds args and parses single value", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "/vault/daily/2026-05-01.md", stderr: "" },
      });

      const result = await cli.dailyPath();

      expect(execCLIMock).toHaveBeenCalledWith(["daily", "info=path"], expect.any(Object));
      expect(result).toEqual({ ok: true, value: "/vault/daily/2026-05-01.md" });
    });
  });

  describe("tags", () => {
    it("builds args without opts", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "#tag1\n#tag2", stderr: "" },
      });

      const result = await cli.tags();

      expect(execCLIMock).toHaveBeenCalledWith(["tags"], expect.any(Object));
      expect(result).toEqual({ ok: true, value: ["#tag1", "#tag2"] });
    });

    it("builds args with sort option", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "#tag1\n#tag2", stderr: "" },
      });

      await cli.tags({ sort: "count" });

      expect(execCLIMock).toHaveBeenCalledWith(["tags", "sort=count"], expect.any(Object));
    });
  });

  describe("propertyRead", () => {
    it("builds args and parses single value", async () => {
      execCLIMock.mockResolvedValue({
        ok: true,
        value: { stdout: "property-value", stderr: "" },
      });

      const result = await cli.propertyRead("note.md", "title");

      expect(execCLIMock).toHaveBeenCalledWith(
        ["property-read", "note.md", "title"],
        expect.any(Object),
      );
      expect(result).toEqual({ ok: true, value: "property-value" });
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
      // Flush microtask queue so the enqueued operation starts and blocks on the gate.
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
