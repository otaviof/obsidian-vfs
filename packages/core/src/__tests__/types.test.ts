import { describe, expectTypeOf, it } from "vitest";

import type { ErrorCode, ResolutionResult, VaultContext, VFSError, VFSResult } from "../index.js";

describe("core type definitions", () => {
  it("VFSResult<string> with ok:true narrows to { value: string }", () => {
    const result: VFSResult<string> = { ok: true, value: "hello" };
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<string>();
    }
  });

  it("VFSResult<string> with ok:false narrows to { error: VFSError }", () => {
    const result: VFSResult<string> = {
      ok: false,
      error: { code: "FILE_NOT_FOUND", message: "missing" },
    };
    if (!result.ok) {
      expectTypeOf(result.error).toEqualTypeOf<VFSError>();
    }
  });

  it("VFSError code is the exact ErrorCode literal union", () => {
    expectTypeOf<VFSError["code"]>().toEqualTypeOf<ErrorCode>();
  });

  it("VaultContext mode is 'full' | 'degraded'", () => {
    expectTypeOf<VaultContext["mode"]>().toEqualTypeOf<"full" | "degraded">();
  });

  it("ResolutionResult targetType is the exact literal union", () => {
    expectTypeOf<ResolutionResult["targetType"]>().toEqualTypeOf<
      "file" | "agent" | "skill" | "search"
    >();
  });
});
