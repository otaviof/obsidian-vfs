import { describe, expect, it } from "vitest";

import { LRUCache } from "./lru-cache.js";

describe("LRUCache", () => {
  it("returns undefined on get from empty cache", () => {
    const cache = new LRUCache<string, string>(3);
    expect(cache.get("key")).toBeUndefined();
  });

  it("stores and retrieves a value", () => {
    const cache = new LRUCache<string, string>(3);
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");
  });

  it("updates existing key without changing size", () => {
    const cache = new LRUCache<string, string>(3);
    cache.set("a", "1");
    cache.set("a", "2");
    expect(cache.get("a")).toBe("2");
    expect(cache.size).toBe(1);
  });

  it("evicts oldest entry when capacity exceeded", () => {
    const cache = new LRUCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("refreshes entry position on get", () => {
    const cache = new LRUCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("deletes an existing entry", () => {
    const cache = new LRUCache<string, string>(3);
    cache.set("a", "1");
    expect(cache.delete("a")).toBe(true);
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("returns false when deleting a missing key", () => {
    const cache = new LRUCache<string, string>(3);
    expect(cache.delete("missing")).toBe(false);
  });

  it("clears all entries", () => {
    const cache = new LRUCache<string, string>(3);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("reports has correctly", () => {
    const cache = new LRUCache<string, string>(3);
    cache.set("a", "1");
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("tracks size correctly", () => {
    const cache = new LRUCache<string, string>(5);
    expect(cache.size).toBe(0);
    cache.set("a", "1");
    expect(cache.size).toBe(1);
    cache.set("b", "2");
    expect(cache.size).toBe(2);
    cache.delete("a");
    expect(cache.size).toBe(1);
  });

  it("throws RangeError on maxSize < 1", () => {
    expect(() => new LRUCache(0)).toThrow(RangeError);
    expect(() => new LRUCache(-1)).toThrow(RangeError);
  });

  it("works with maxSize of 1", () => {
    const cache = new LRUCache<string, string>(1);
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");
    cache.set("b", "2");
    expect(cache.has("a")).toBe(false);
    expect(cache.get("b")).toBe("2");
    expect(cache.size).toBe(1);
  });

  it("does not refresh entry position on has", () => {
    const cache = new LRUCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.has("a");
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("moves entry to most-recent on set of existing key", () => {
    const cache = new LRUCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(true);
    expect(cache.get("a")).toBe(10);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });
});
