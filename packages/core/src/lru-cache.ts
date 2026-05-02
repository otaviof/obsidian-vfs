/**
 * Generic size-bounded LRU cache backed by a Map. Evicts the least-recently-used
 * entry when capacity is exceeded. No TTL — invalidation is caller-controlled.
 */
export class LRUCache<K, V> {
  readonly #maxSize: number;
  readonly #map: Map<K, V>;

  constructor(maxSize: number) {
    if (maxSize < 1) throw new RangeError("maxSize must be >= 1");
    this.#maxSize = maxSize;
    this.#map = new Map();
  }

  /** Return the value for `key`, moving it to most-recent position. */
  get(key: K): V | undefined {
    if (!this.#map.has(key)) return undefined;
    const value = this.#map.get(key) as V;
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  /** Insert or update `key`. Evicts the oldest entry when at capacity. */
  set(key: K, value: V): void {
    this.#map.delete(key);
    if (this.#map.size >= this.#maxSize) {
      const oldest = this.#map.keys().next().value!;
      this.#map.delete(oldest);
    }
    this.#map.set(key, value);
  }

  /** Check whether `key` exists without affecting recency. */
  has(key: K): boolean {
    return this.#map.has(key);
  }

  /** Remove `key` from the cache. Returns `true` if the key existed. */
  delete(key: K): boolean {
    return this.#map.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.#map.clear();
  }

  /** Current number of entries in the cache. */
  get size(): number {
    return this.#map.size;
  }
}
