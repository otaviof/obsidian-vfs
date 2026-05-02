import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FSWatcher } from "node:fs";

import { VaultFileWatcher } from "./file-watcher.js";
import { LRUCache } from "./lru-cache.js";

vi.mock("node:fs", () => ({
  watch: vi.fn(),
}));

const { watch } = await import("node:fs");
const watchMock = vi.mocked(watch as unknown as (...args: unknown[]) => FSWatcher);

interface FakeWatcher {
  readonly fsWatcher: FSWatcher;
  readonly closeMock: ReturnType<typeof vi.fn>;
  triggerEvent(type: string, filename: string | null): void;
  triggerError(): void;
}

function makeFakeWatcher(): FakeWatcher & {
  triggerError: () => void;
} {
  const closeMock = vi.fn();
  let callback: ((event: string, filename: string | null) => void) | null = null;
  let errorHandler: ((...args: unknown[]) => void) | null = null;

  const fsWatcher = {
    close: closeMock,
    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === "error") errorHandler = handler;
      return fsWatcher;
    },
  } as unknown as FSWatcher;

  watchMock.mockImplementation((_path: unknown, _opts: unknown, cb: unknown) => {
    callback = cb as (event: string, filename: string | null) => void;
    return fsWatcher;
  });

  return {
    fsWatcher,
    closeMock,
    triggerEvent(type: string, filename: string | null) {
      callback?.(type, filename);
    },
    triggerError() {
      errorHandler?.(new Error("watch error"));
    },
  };
}

describe("VaultFileWatcher", () => {
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    cache = new LRUCache<string, string>(100);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("start() creates watcher with recursive option", () => {
    const fakeWatcher = makeFakeWatcher();
    const watcher = new VaultFileWatcher("/vault", cache);
    watcher.start();
    expect(watchMock).toHaveBeenCalledWith("/vault", { recursive: true }, expect.any(Function));
    watcher.stop();
    expect(fakeWatcher.closeMock).toHaveBeenCalled();
  });

  it("start() is idempotent", () => {
    makeFakeWatcher();
    const watcher = new VaultFileWatcher("/vault", cache);
    watcher.start();
    watcher.start();
    expect(watchMock).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("stop() closes watcher and clears timers", () => {
    const fakeWatcher = makeFakeWatcher();
    const watcher = new VaultFileWatcher("/vault", cache, 100);
    watcher.start();

    fakeWatcher.triggerEvent("change", "file.md");
    watcher.stop();

    vi.advanceTimersByTime(200);
    expect(fakeWatcher.closeMock).toHaveBeenCalled();
  });

  it("debounced event invalidates cache", () => {
    const fakeWatcher = makeFakeWatcher();
    cache.set("/vault/file.md", "old content");
    const watcher = new VaultFileWatcher("/vault", cache, 100);
    watcher.start();

    fakeWatcher.triggerEvent("change", "file.md");
    expect(cache.has("/vault/file.md")).toBe(true);

    vi.advanceTimersByTime(100);
    expect(cache.has("/vault/file.md")).toBe(false);

    watcher.stop();
  });

  it("rapid events coalesce into single invalidation", () => {
    const fakeWatcher = makeFakeWatcher();
    const listener = vi.fn();
    const watcher = new VaultFileWatcher("/vault", cache, 100);
    watcher.start();
    watcher.onDidChange(listener);

    fakeWatcher.triggerEvent("change", "file.md");
    vi.advanceTimersByTime(50);
    fakeWatcher.triggerEvent("change", "file.md");
    vi.advanceTimersByTime(50);
    fakeWatcher.triggerEvent("change", "file.md");
    vi.advanceTimersByTime(100);

    expect(listener).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("listener receives events with correct data", () => {
    const fakeWatcher = makeFakeWatcher();
    const listener = vi.fn();
    const watcher = new VaultFileWatcher("/vault", cache, 100);
    watcher.start();
    watcher.onDidChange(listener);

    fakeWatcher.triggerEvent("change", "notes/file.md");
    vi.advanceTimersByTime(100);

    expect(listener).toHaveBeenCalledWith([{ type: "changed", path: "/vault/notes/file.md" }]);
    watcher.stop();
  });

  it("multiple listeners all notified", () => {
    const fakeWatcher = makeFakeWatcher();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const watcher = new VaultFileWatcher("/vault", cache, 100);
    watcher.start();
    watcher.onDidChange(listener1);
    watcher.onDidChange(listener2);

    fakeWatcher.triggerEvent("change", "file.md");
    vi.advanceTimersByTime(100);

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("Disposable.dispose() removes listener", () => {
    const fakeWatcher = makeFakeWatcher();
    const listener = vi.fn();
    const watcher = new VaultFileWatcher("/vault", cache, 100);
    watcher.start();
    const disposable = watcher.onDidChange(listener);

    disposable.dispose();

    fakeWatcher.triggerEvent("change", "file.md");
    vi.advanceTimersByTime(100);

    expect(listener).not.toHaveBeenCalled();
    watcher.stop();
  });

  it("null filename is ignored", () => {
    const fakeWatcher = makeFakeWatcher();
    const listener = vi.fn();
    const watcher = new VaultFileWatcher("/vault", cache, 100);
    watcher.start();
    watcher.onDidChange(listener);

    fakeWatcher.triggerEvent("change", null);
    vi.advanceTimersByTime(200);

    expect(listener).not.toHaveBeenCalled();
    watcher.stop();
  });

  it("isActive reflects state", () => {
    makeFakeWatcher();
    const watcher = new VaultFileWatcher("/vault", cache);
    expect(watcher.isActive).toBe(false);
    watcher.start();
    expect(watcher.isActive).toBe(true);
    watcher.stop();
    expect(watcher.isActive).toBe(false);
  });

  it("uses custom debounceMs", () => {
    const fakeWatcher = makeFakeWatcher();
    const listener = vi.fn();
    const watcher = new VaultFileWatcher("/vault", cache, 500);
    watcher.start();
    watcher.onDidChange(listener);

    fakeWatcher.triggerEvent("change", "file.md");
    vi.advanceTimersByTime(400);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(listener).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("stops on fs.watch error event", () => {
    const fakeWatcher = makeFakeWatcher();
    const watcher = new VaultFileWatcher("/vault", cache);
    watcher.start();
    expect(watcher.isActive).toBe(true);

    fakeWatcher.triggerError();
    expect(watcher.isActive).toBe(false);
    expect(fakeWatcher.closeMock).toHaveBeenCalled();
  });

  it("degrades to no-op when watch() throws", () => {
    watchMock.mockImplementation(() => {
      throw new Error("recursive watch not supported");
    });
    const watcher = new VaultFileWatcher("/vault", cache);
    watcher.start();
    expect(watcher.isActive).toBe(false);
  });
});
