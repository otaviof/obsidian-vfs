import { describe, expectTypeOf, it } from "vitest";

import type { BacklinkEntry, ErrorCode, ObsidianCLI, SearchMatch, VFSResult } from "./index.js";

describe("CLI type definitions", () => {
  it("SearchMatch.file is string", () => {
    expectTypeOf<SearchMatch["file"]>().toEqualTypeOf<string>();
  });

  it("SearchMatch.matches is { line: number; text: string }[]", () => {
    expectTypeOf<SearchMatch["matches"]>().toEqualTypeOf<{ line: number; text: string }[]>();
  });

  it("BacklinkEntry.file is string", () => {
    expectTypeOf<BacklinkEntry["file"]>().toEqualTypeOf<string>();
  });

  it("ObsidianCLI.search returns Promise<VFSResult<string[]>>", () => {
    expectTypeOf<ObsidianCLI["search"]>().returns.toEqualTypeOf<Promise<VFSResult<string[]>>>();
  });

  it("ObsidianCLI.searchContext returns Promise<VFSResult<SearchMatch[]>>", () => {
    expectTypeOf<ObsidianCLI["searchContext"]>().returns.toEqualTypeOf<
      Promise<VFSResult<SearchMatch[]>>
    >();
  });

  it("ObsidianCLI.backlinks returns Promise<VFSResult<BacklinkEntry[]>>", () => {
    expectTypeOf<ObsidianCLI["backlinks"]>().returns.toEqualTypeOf<
      Promise<VFSResult<BacklinkEntry[]>>
    >();
  });

  it("ObsidianCLI.isAvailable returns Promise<boolean>", () => {
    expectTypeOf<ObsidianCLI["isAvailable"]>().returns.toEqualTypeOf<Promise<boolean>>();
  });

  it("ObsidianCLI.create returns Promise<VFSResult<string>>", () => {
    expectTypeOf<ObsidianCLI["create"]>().returns.toEqualTypeOf<Promise<VFSResult<string>>>();
  });

  it("ObsidianCLI.delete returns Promise<VFSResult<void>>", () => {
    expectTypeOf<ObsidianCLI["delete"]>().returns.toEqualTypeOf<Promise<VFSResult<void>>>();
  });

  it("ErrorCode includes CLI_UNAVAILABLE and TIMEOUT", () => {
    expectTypeOf<Extract<ErrorCode, "CLI_UNAVAILABLE">>().toEqualTypeOf<"CLI_UNAVAILABLE">();
    expectTypeOf<Extract<ErrorCode, "TIMEOUT">>().toEqualTypeOf<"TIMEOUT">();
  });

  it("search opts accepts path, limit, and contextLength", () => {
    expectTypeOf<Parameters<ObsidianCLI["search"]>[1]>().toEqualTypeOf<
      { path?: string; limit?: number; contextLength?: number } | undefined
    >();
  });

  it("searchContext opts accepts path, limit, and contextLength", () => {
    expectTypeOf<Parameters<ObsidianCLI["searchContext"]>[1]>().toEqualTypeOf<
      { path?: string; limit?: number; contextLength?: number } | undefined
    >();
  });
});
