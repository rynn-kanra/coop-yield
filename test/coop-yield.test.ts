import { describe, it, expect, vi } from "bun:test";
import { createCoopYield } from "../src/coop-yield";

describe("createCoopYield", () => {
  it("should not yield immediately", () => {
    const yielder = createCoopYield({ microMs: 5, macroMs: 20 });
    const result = yielder.check();
    expect(result).toBe(false);
    expect(yielder.yield).toBeUndefined();
  });

  it("should eventually schedule a microtask yield", async () => {
    let macrotaskExecuted = false;
    setTimeout(() => {
      macrotaskExecuted = true;
    });

    let microtaskExecuted = false;
    Promise.resolve().then(() => {
      microtaskExecuted = true;
    });

    const yielder = createCoopYield({ microMs: 2, macroMs: 100 });
    let yielded = false;
    while (true) {
      if (yielder.check()) {
        yielded = true;
        await yielder.yield;
        break;
      }
    }

    expect(yielded).toBe(true);
    expect(yielder.yield).toBeInstanceOf(Promise);
    expect(microtaskExecuted).toBe(true);
    expect(macrotaskExecuted).toBe(false);
  });

  it("should schedule a macrotask yield after macroMs", async () => {
    const yielder = createCoopYield({ microMs: 5, macroMs: 5 });
    let microtaskExecuted = false;

    let yielded = false;
    while (true) {
      if (yielder.check()) {
        yielded = true;
        Promise.resolve().then(() => {
          microtaskExecuted = true;
        });

        await yielder.yield;
        break;
      }
    }

    expect(yielded).toBe(true);
    expect(yielder.yield).toBeInstanceOf(Promise);
    expect(microtaskExecuted).toBe(true);
  });

  it("should reset timers and counters properly", async () => {
    const yielder = createCoopYield({ microMs: 2, macroMs: 10 });
    while (true) {
      if (yielder.check()) {
        await yielder.yield;
        break;
      }
    }

    const prevYield = yielder.yield;
    yielder.reset();
    expect(yielder.yield).toBeUndefined();

    // Should behave fresh after reset
    let yielded = false;
    while (true) {
      if (yielder.check()) {
        await yielder.yield;
        yielded = true;
        break;
      }
    }
    expect(yielded).toBe(true);
    expect(yielder.yield).not.toBe(prevYield);
  });

  it("should throw if aborted", () => {
    const controller = new AbortController();
    const yielder = createCoopYield({ microMs: 5, macroMs: 10, abort: controller.signal });

    controller.abort(new Error("Manually aborted"));

    expect(() => yielder.check()).toThrowError("Manually aborted");
  });

  it("should handle very tight loops without immediate yielding", () => {
    const yielder = createCoopYield({ microMs: 50, macroMs: 100 });
    for (let i = 0; i < 1000; i++) {
      if (yielder.check()) break;
    }
    // usually will not yield instantly for small loops
    expect(yielder.yield).toBeUndefined();
  });

  it("should allow other tasks to run during yields", async () => {
    const yielder = createCoopYield({ microMs: 2, macroMs: 5 });

    let microCounter = 0;
    const asyncMicroTask = async () => {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve(); // microtask
        microCounter++;
      }
    };

    let macroCounter = 0;
    const asyncMacroTask = async () => {
      for (let i = 0; i < 10; i++) {
        await new Promise<void>((r) => setTimeout(() => r(), 0)); // macrotask
        macroCounter++;
      }
    };

    const loop = async () => {
      while (microCounter < 10 || macroCounter < 10) {
        yielder.check() && await yielder.yield;
      }
    };

    await Promise.all([loop(), asyncMicroTask(), asyncMacroTask()]);

    expect(microCounter).toBe(10);
    expect(macroCounter).toBe(10);
  });

  it("should not have too many overhead", async () => {
    function fibonacci(n: number): number {
      if (n <= 0) return 0;
      if (n === 1) return 1;

      let a = 0, b = 1;
      for (let i = 2; i <= n; i++) {
        const next = a + b;
        a = b;
        b = next;
      }
      return b;
    }

    let d = 0;
    // warmup
    for (let i = 0; i < 100; i++) {
      d += fibonacci(i);
    }

    const loop = 30_000;
    performance.mark("start");
    for (let i = 0; i < loop; i++) {
      d += fibonacci(i);
    }
    performance.mark("end");
    performance.measure("baseLine", "start", "end");

    d = 0;
    const yielder = createCoopYield();
    performance.mark("start");
    for (let i = 0; i < loop; i++) {
      d += fibonacci(i);
      yielder.check() && await yielder.yield;
    }
    performance.mark("end");

    performance.measure("baseLine", "start", "end");
    const baseLine = performance.getEntriesByName("baseLine")[0];
    const yieldMark = performance.getEntriesByName("baseLine")[1];

    expect(baseLine!.duration * 2).toBeGreaterThanOrEqual(yieldMark!.duration);
  });
});
