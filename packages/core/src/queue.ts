export class AsyncQueue {
  #tail: Promise<void>;

  constructor() {
    this.#tail = Promise.resolve();
  }

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
