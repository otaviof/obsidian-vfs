import { watch, type FSWatcher, type WatchEventType } from "node:fs";
import path from "node:path";

import type { LRUCache } from "./lru-cache.js";
import type { Disposable } from "./types.js";

/** Default debounce interval in milliseconds for coalescing rapid file changes. */
const DEFAULT_DEBOUNCE_MS = 200;

/** Type of file system change. */
export type FileChangeType = "changed" | "created" | "deleted";

/**
 * A single file change event.
 */
export interface FileChangeEvent {
  readonly type: FileChangeType;
  readonly path: string;
}

/**
 * Listener callback for file change events.
 */
export type FileChangeListener = (events: readonly FileChangeEvent[]) => void;

/**
 * Watches the vault root for file changes with debounced cache invalidation.
 */
export class VaultFileWatcher {
  readonly #vaultRoot: string;
  readonly #cache: LRUCache<string, string>;
  readonly #debounceMs: number;
  readonly #listeners: Set<FileChangeListener>;
  readonly #pending: Map<string, ReturnType<typeof setTimeout>>;
  #watcher: FSWatcher | null;

  constructor(vaultRoot: string, cache: LRUCache<string, string>, debounceMs?: number) {
    this.#vaultRoot = vaultRoot;
    this.#cache = cache;
    this.#debounceMs = debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.#listeners = new Set();
    this.#pending = new Map();
    this.#watcher = null;
  }

  /** Start watching. Idempotent — second call is a no-op. */
  start(): void {
    if (this.#watcher) return;
    try {
      this.#watcher = watch(this.#vaultRoot, { recursive: true }, this.#handleEvent.bind(this));
      this.#watcher.on("error", () => {
        this.stop();
      });
    } catch {
      this.#watcher = null;
    }
  }

  /** Stop watching and clear all pending timers. */
  stop(): void {
    this.#watcher?.close();
    this.#watcher = null;
    for (const timer of this.#pending.values()) {
      clearTimeout(timer);
    }
    this.#pending.clear();
  }

  /** Whether the watcher is currently active. */
  get isActive(): boolean {
    return this.#watcher !== null;
  }

  /** Register a listener for file change events. Returns a Disposable to unsubscribe. */
  onDidChange(listener: FileChangeListener): Disposable {
    this.#listeners.add(listener);
    return { dispose: () => this.#listeners.delete(listener) };
  }

  #handleEvent(eventType: WatchEventType, filename: string | null): void {
    if (filename === null) return;

    const absolutePath = path.join(this.#vaultRoot, filename);
    const existing = this.#pending.get(absolutePath);
    if (existing !== undefined) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.#pending.delete(absolutePath);
      this.#cache.delete(absolutePath);
      const changeType = this.#mapEventType(eventType);
      const event: FileChangeEvent = { type: changeType, path: absolutePath };
      for (const listener of this.#listeners) {
        listener([event]);
      }
    }, this.#debounceMs);

    this.#pending.set(absolutePath, timer);
  }

  // node:fs.watch "rename" is ambiguous (create or delete); consumers use stat() to disambiguate.
  #mapEventType(_eventType: WatchEventType): FileChangeType {
    return "changed";
  }
}
