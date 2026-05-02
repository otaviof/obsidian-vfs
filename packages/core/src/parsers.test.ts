import { describe, expect, it } from "vitest";

import type { BacklinkEntry, SearchMatch } from "./cli.js";
import {
  detectCLIError,
  parseBacklinksJSON,
  parseLineList,
  parseSearchFiles,
  parseSearchJSON,
  parseSingleValue,
} from "./parsers.js";

describe("parsers", () => {
  describe("detectCLIError", () => {
    it("returns undefined for normal output", () => {
      const result = detectCLIError("/path/to/vault", "vault info=path");
      expect(result).toBeUndefined();
    });

    it("returns CLI_ERROR when output starts with Error:", () => {
      const result = detectCLIError("Error: vault not found", "vault info=path");
      expect(result).toEqual({
        ok: false,
        error: {
          code: "CLI_ERROR",
          message: "Error: vault not found",
          command: "vault info=path",
        },
      });
    });
  });

  describe("parseSingleValue", () => {
    it("returns trimmed stdout on success", () => {
      const result = parseSingleValue("  /path/to/vault  \n", "vault info=path");
      expect(result).toEqual({ ok: true, value: "/path/to/vault" });
    });

    it("returns PARSE_ERROR for empty output", () => {
      const result = parseSingleValue("   \n  ", "vault info=path");
      expect(result).toEqual({
        ok: false,
        error: { code: "PARSE_ERROR", message: "Empty output", command: "vault info=path" },
      });
    });

    it("returns CLI_ERROR when stdout starts with Error:", () => {
      const result = parseSingleValue("Error: something went wrong", "vault info=path");
      expect(result).toEqual({
        ok: false,
        error: {
          code: "CLI_ERROR",
          message: "Error: something went wrong",
          command: "vault info=path",
        },
      });
    });
  });

  describe("parseLineList", () => {
    it("returns array of trimmed non-empty lines", () => {
      const result = parseLineList("file1.md\n  file2.md  \n\nfile3.md\n", "files");
      expect(result).toEqual({ ok: true, value: ["file1.md", "file2.md", "file3.md"] });
    });

    it("returns empty array for empty output", () => {
      const result = parseLineList("   \n  \n", "files");
      expect(result).toEqual({ ok: true, value: [] });
    });

    it("returns CLI_ERROR when stdout starts with Error:", () => {
      const result = parseLineList("Error: no files found", "files");
      expect(result).toEqual({
        ok: false,
        error: { code: "CLI_ERROR", message: "Error: no files found", command: "files" },
      });
    });
  });

  describe("parseSearchJSON", () => {
    it("parses valid SearchMatch JSON array", () => {
      const input: SearchMatch[] = [
        { file: "note.md", matches: [{ line: 1, text: "hello" }] },
        { file: "other.md", matches: [] },
      ];
      const result = parseSearchJSON(JSON.stringify(input), "search query");
      expect(result).toEqual({ ok: true, value: input });
    });

    it("returns PARSE_ERROR for non-array JSON", () => {
      const result = parseSearchJSON('{"file":"note.md"}', "search query");
      expect(result).toEqual({
        ok: false,
        error: { code: "PARSE_ERROR", message: "Expected SearchMatch[]", command: "search query" },
      });
    });

    it("returns PARSE_ERROR for array with wrong shape", () => {
      const result = parseSearchJSON('[{"wrong":"shape"}]', "search query");
      expect(result).toEqual({
        ok: false,
        error: { code: "PARSE_ERROR", message: "Expected SearchMatch[]", command: "search query" },
      });
    });

    it("returns PARSE_ERROR for invalid JSON", () => {
      const result = parseSearchJSON("{invalid json", "search query");
      expect(result).toEqual({
        ok: false,
        error: { code: "PARSE_ERROR", message: "Invalid JSON", command: "search query" },
      });
    });

    it("returns CLI_ERROR when stdout starts with Error:", () => {
      const result = parseSearchJSON("Error: search failed", "search query");
      expect(result).toEqual({
        ok: false,
        error: { code: "CLI_ERROR", message: "Error: search failed", command: "search query" },
      });
    });
  });

  describe("parseBacklinksJSON", () => {
    it("parses valid BacklinkEntry JSON array", () => {
      const input: BacklinkEntry[] = [{ file: "note.md" }, { file: "other.md" }];
      const result = parseBacklinksJSON(JSON.stringify(input), "backlinks file.md");
      expect(result).toEqual({ ok: true, value: input });
    });

    it("returns PARSE_ERROR for non-array JSON", () => {
      const result = parseBacklinksJSON('{"file":"note.md"}', "backlinks file.md");
      expect(result).toEqual({
        ok: false,
        error: {
          code: "PARSE_ERROR",
          message: "Expected BacklinkEntry[]",
          command: "backlinks file.md",
        },
      });
    });

    it("returns PARSE_ERROR for array with wrong shape", () => {
      const result = parseBacklinksJSON('[{"path":"note.md"}]', "backlinks file.md");
      expect(result).toEqual({
        ok: false,
        error: {
          code: "PARSE_ERROR",
          message: "Expected BacklinkEntry[]",
          command: "backlinks file.md",
        },
      });
    });

    it("returns PARSE_ERROR for invalid JSON", () => {
      const result = parseBacklinksJSON("[invalid", "backlinks file.md");
      expect(result).toEqual({
        ok: false,
        error: { code: "PARSE_ERROR", message: "Invalid JSON", command: "backlinks file.md" },
      });
    });

    it("returns CLI_ERROR when stdout starts with Error:", () => {
      const result = parseBacklinksJSON("Error: file not found", "backlinks file.md");
      expect(result).toEqual({
        ok: false,
        error: { code: "CLI_ERROR", message: "Error: file not found", command: "backlinks file.md" },
      });
    });
  });

  describe("parseSearchFiles", () => {
    it("parses plain string[] from Obsidian CLI", () => {
      const input = ["note.md", "other.md"];
      const result = parseSearchFiles(JSON.stringify(input), "search query");
      expect(result).toEqual({ ok: true, value: ["note.md", "other.md"] });
    });

    it("extracts file paths from SearchMatch JSON", () => {
      const input: SearchMatch[] = [
        { file: "note.md", matches: [{ line: 1, text: "hello" }] },
        { file: "other.md", matches: [{ line: 5, text: "world" }] },
      ];
      const result = parseSearchFiles(JSON.stringify(input), "search query");
      expect(result).toEqual({ ok: true, value: ["note.md", "other.md"] });
    });

    it("returns PARSE_ERROR for non-array JSON", () => {
      const result = parseSearchFiles('{"file":"note.md"}', "search query");
      expect(result).toEqual({
        ok: false,
        error: { code: "PARSE_ERROR", message: "Expected JSON array", command: "search query" },
      });
    });

    it("returns PARSE_ERROR for array with wrong shape", () => {
      const result = parseSearchFiles('[{"path":"note.md"}]', "search query");
      expect(result).toEqual({
        ok: false,
        error: {
          code: "PARSE_ERROR",
          message: "Expected string[] or SearchMatch[]",
          command: "search query",
        },
      });
    });

    it("returns PARSE_ERROR for invalid JSON", () => {
      const result = parseSearchFiles("not json", "search query");
      expect(result).toEqual({
        ok: false,
        error: { code: "PARSE_ERROR", message: "Invalid JSON", command: "search query" },
      });
    });

    it("returns CLI_ERROR when stdout starts with Error:", () => {
      const result = parseSearchFiles("Error: search failed", "search query");
      expect(result).toEqual({
        ok: false,
        error: { code: "CLI_ERROR", message: "Error: search failed", command: "search query" },
      });
    });
  });
});
