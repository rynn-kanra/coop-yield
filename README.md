# coop-yield (`Cooperative Yield`)

`coop-yield` is a **cooperative yield** utility for JavaScript/TypeScript that helps prevent long-running loops from blocking the event loop. It schedules **microtask** and **macrotask** yields automatically, letting other tasks (timers, UI updates, async operations) run smoothly.

---

## Features

- Automatically yields control to the event loop based on **elapsed time**.
- Supports both **microtasks** (via `Promise.resolve`) and **macrotasks** (via `setImmediate` or `setTimeout` fallback).
- Adaptive iteration estimation to minimize unnecessary yields.
- Optional **AbortSignal** support for cancellation.
- Lightweight, zero dependencies, works in Node.js and browsers.

---

## Installation

```bash
# npm
npm install coop-yield

# bun
bun add coop-yield

# pnpm
pnpm add coop-yield
```

---

## API

### `createCoopYield(options?)`

Creates a cooperative yielder instance.

#### Parameters

- `options?: CheckpointOption`
  - `microMs: number` – Target duration (ms) before scheduling a microtask yield. Default: `8`.
  - `macroMs: number` – Target duration (ms) before scheduling a macrotask yield. Default: `50`.
  - `abort?: AbortSignal` – Optional signal to cancel execution early.

#### Returns

A `CoopYielder` object:

```ts
export type CoopYielder = {
  reset(): void;
  check(iter?: number): boolean;
  yield?: Promise<void>;
};
```

### `CoopYielder` members

#### `check(iter?: number)`

Checks if the yielder should yield based on elapsed time and iteration counts.

- Returns `true` if a yield is scheduled (then you should `await yielder.yield`).
- Returns `false` if no yield is needed.
- Throws if `AbortSignal` is aborted.

#### `reset()`

Resets timers, iteration counters, and yield estimates. Useful when starting a new batch of work.

#### `yield`

A `Promise<void>` that resolves **after a scheduled yield completes**.

- Microtask yield resolves in the next tick.
- Macrotask yield resolves on the next macrotask (`setImmediate` or `setTimeout` fallback).

---

## Usage

### Example: Loop with cooperative yielding

```ts
const yielder = createCoopYield({ microMs: 5, macroMs: 20 });

async function heavyTask() {
  for (let i = 0; i < 1000; i++) {
    // Do heavy work
    Math.sqrt(i);

    // Periodically yield to the event loop
    yielder.check() && (await yielder.yield);
  }
}

heavyTask().then(() => console.log("Done!"));
```

---

### Example: Using AbortSignal

```ts
const controller = new AbortController();
const yielder = createCoopYield({
  microMs: 5,
  macroMs: 20,
  abort: controller.signal,
});

setTimeout(() => controller.abort(), 100); // cancel after 100ms

try {
  while (true) {
    yielder.check() && (await yielder.yield);
  }
} catch (err) {
  console.log("Loop aborted:", err);
}
```

---

## How It Works

1. Keeps track of **microtask** and **macrotask** timers.
2. Estimates iterations per millisecond dynamically.
3. Schedules a yield:
   - **Microtask**: resolves on the next promise tick (`Promise.resolve()`).
   - **Macrotask**: resolves on the next macrotask (`setImmediate` or `setTimeout` fallback).
4. Resets iteration counters after each yield to maintain smooth performance.

---

## Notes

- `setImmediate` is preferred for macrotask yields in Node.js/Bun, with `setTimeout` fallback in browsers.
- Microtask yields allow **other promises** to run, but **macrotask yields** let timers and UI updates run.
- Use `reset()` if you want to restart timing or start a new loop batch.

---

## License

[MIT](LICENSE).
