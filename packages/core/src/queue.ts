/**
 * Serializes async operations so only one runs at a time. Used to ensure a
 * single CLI subprocess is active at any moment.
 */
export class AsyncQueue {
  #tail: Promise<void>;

  constructor() {
    this.#tail = Promise.resolve();
  }

  /** Appends `fn` to the queue, executing it after all prior tasks settle. */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.#tail.then(() => fn());
    // Swallow result/error so #tail always resolves, subsequent tasks proceed regardless.
    this.#tail = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}
