import { afterEach, describe, expect, it, vi } from "vitest";

import { runHookEntry } from "./stdin-runner.js";

function mockStdin(data: string): void {
  const stdinMock = {
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        next() {
          if (done) return Promise.resolve({ value: undefined, done: true as const });
          done = true;
          return Promise.resolve({ value: Buffer.from(data), done: false as const });
        },
      };
    },
  };
  vi.spyOn(process, "stdin", "get").mockReturnValue(stdinMock as never);
}

describe("runHookEntry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes {} when parser returns null", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    mockStdin("invalid");
    runHookEntry("test", () => null, vi.fn());

    await vi.waitFor(() => {
      expect(writes).toContain("{}\n");
    });
  });

  it("writes handler output as JSON when parser succeeds", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const input = { data: "test" };
    mockStdin(JSON.stringify(input));

    runHookEntry(
      "test",
      (raw: string) => JSON.parse(raw) as typeof input,
      () => Promise.resolve({ result: "ok" }),
    );

    await vi.waitFor(() => {
      expect(writes).toContain('{"result":"ok"}\n');
    });
  });

  it("writes {} and logs to stderr when handler throws", async () => {
    const stdoutWrites: string[] = [];
    const stderrWrites: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    mockStdin('{"valid":true}');

    runHookEntry(
      "test-handler",
      (raw: string) => JSON.parse(raw) as { valid: boolean },
      () => Promise.reject(new Error("boom")),
    );

    await vi.waitFor(() => {
      expect(stdoutWrites).toContain("{}\n");
      expect(stderrWrites.some((w) => w.includes("test-handler") && w.includes("boom"))).toBe(true);
    });
  });
});
