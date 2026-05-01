import { beforeEach, describe, expect, it } from "vitest";

import { AsyncQueue } from "../queue.js";

describe("AsyncQueue", () => {
  let queue: AsyncQueue;

  beforeEach(() => {
    queue = new AsyncQueue();
  });

  it("executes tasks sequentially", async () => {
    const order: number[] = [];
    let releaseGate: () => void;
    const gate = new Promise<void>((r) => {
      releaseGate = r;
    });

    const task1 = queue.enqueue(async () => {
      await gate;
      order.push(1);
      return 1;
    });

    const task2 = queue.enqueue(() => {
      order.push(2);
      return Promise.resolve(2);
    });

    releaseGate!();
    await Promise.all([task1, task2]);
    expect(order).toEqual([1, 2]);
  });

  it("isolates failures — rejected task does not block subsequent tasks", async () => {
    const order: number[] = [];

    const task1 = queue.enqueue(() => {
      order.push(1);
      return Promise.reject<never>(new Error("task1 failed"));
    });

    const task2 = queue.enqueue(() => {
      order.push(2);
      return Promise.resolve(2);
    });

    await expect(task1).rejects.toThrow("task1 failed");
    await expect(task2).resolves.toBe(2);
    expect(order).toEqual([1, 2]);
  });

  it("forwards return values", async () => {
    const result = await queue.enqueue(() => Promise.resolve("hello"));
    expect(result).toBe("hello");
  });

  it("propagates errors from rejected tasks", async () => {
    const task = queue.enqueue(() => Promise.reject<never>(new Error("fail")));
    await expect(task).rejects.toThrow("fail");
  });

  it("maintains FIFO order with side-effect tracking", async () => {
    const sideEffects: string[] = [];

    const tasks = [
      queue.enqueue(() => {
        sideEffects.push("a");
        return Promise.resolve();
      }),
      queue.enqueue(() => {
        sideEffects.push("b");
        return Promise.resolve();
      }),
      queue.enqueue(() => {
        sideEffects.push("c");
        return Promise.resolve();
      }),
    ];

    await Promise.all(tasks);
    expect(sideEffects).toEqual(["a", "b", "c"]);
  });

  it("accepts tasks after the queue becomes idle", async () => {
    await queue.enqueue(() => Promise.resolve(1));
    await queue.enqueue(() => Promise.resolve(2));

    const result = await queue.enqueue(() => Promise.resolve(3));
    expect(result).toBe(3);
  });
});
