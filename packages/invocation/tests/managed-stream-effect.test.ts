import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { z } from "@relkit/schema";
import { ManagedStreamIO, managedValidatedStreamEffect } from "../src/index.js";

describe("managed stream Effect operations", () => {
  test("uses an injected validator and keeps item order with one active pull", async () => {
    const seen: unknown[] = [];
    let active = 0;
    let maximum = 0;
    let next = 0;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const source: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          active += 1;
          maximum = Math.max(maximum, active);
          next += 1;
          if (next === 1) {
            started();
            await gate;
          }
          active -= 1;
          return { value: next, done: false };
        },
      }),
    };
    const layer = Layer.succeed(ManagedStreamIO, {
      validate: async (_schema, value) => {
        seen.push(value);
        return { value };
      },
      scheduleIdle: () => () => undefined,
    });
    const stream = Effect.runSync(
      Effect.provide(
        managedValidatedStreamEffect<number>({
          source,
          schema: z.number(),
          maxItemBytes: 10,
          idleMs: 1000,
          abort: () => undefined,
          run: (work) => work(),
          settle: async () => undefined,
        }),
        layer,
      ),
    );
    const iterator = stream[Symbol.asyncIterator]();
    const first = Effect.runPromise(iterator.nextEffect());
    await ready;
    const second = Effect.runPromise(iterator.nextEffect());
    await Promise.resolve();
    expect(next).toBe(1);
    release();
    expect(await Promise.all([first, second])).toEqual([
      { value: 1, done: false },
      { value: 2, done: false },
    ]);
    expect(maximum).toBe(1);
    expect(seen).toEqual([1, 2]);
  });

  test("keeps the first typed failure ahead of a waiting pull", async () => {
    let calls = 0;
    const source: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          calls += 1;
          return { value: "wrong", done: false };
        },
        return: async () => ({ value: undefined, done: true }),
      }),
    };
    const stream = Effect.runSync(
      managedValidatedStreamEffect<number>({
        source,
        schema: z.number(),
        maxItemBytes: 10,
        idleMs: 1000,
        abort: () => undefined,
        run: (work) => work(),
        settle: async () => undefined,
      }),
    );
    const iterator = stream[Symbol.asyncIterator]();
    const recover = () =>
      Effect.runPromise(
        Effect.catchTag(iterator.nextEffect(), "StreamLifecycleFailure", (error) =>
          Effect.succeed(error.code),
        ),
      );
    expect(await Promise.all([recover(), recover()])).toEqual([
      "RELKIT_STREAM_ITEM_VALIDATION",
      "RELKIT_STREAM_ITEM_VALIDATION",
    ]);
    expect(calls).toBe(1);
  });

  test("closes and settles when the injected idle scheduler fires", async () => {
    let expire!: () => void;
    let cancelled = false;
    let closed = 0;
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const reasons: unknown[] = [];
    const layer = Layer.succeed(ManagedStreamIO, {
      validate: async (_schema, value) => ({ value }),
      scheduleIdle: (_ms, onIdle) => {
        expire = onIdle;
        return () => {
          cancelled = true;
        };
      },
    });
    const source: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ value: 1, done: false }),
        return: async () => {
          closed += 1;
          throw new Error("close failed");
        },
      }),
    };
    const stream = Effect.runSync(
      Effect.provide(
        managedValidatedStreamEffect({
          source,
          schema: z.number(),
          maxItemBytes: 10,
          idleMs: 1000,
          abort: (reason) => reasons.push(reason),
          run: (work) => work(),
          settle: async () => {
            settle();
            throw new Error("settlement observer failed");
          },
        }),
        layer,
      ),
    );
    stream[Symbol.asyncIterator]();
    expire();
    await settled;
    expect(reasons[0]).toMatchObject({ code: "RELKIT_STREAM_CONSUMER_IDLE" });
    expect(closed).toBe(1);
    expect(cancelled).toBe(true);
  });

  test("closes and settles even when the abort observer throws", async () => {
    let expire!: () => void;
    let finish!: () => void;
    const settled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let closes = 0;
    let settlements = 0;
    const layer = Layer.succeed(ManagedStreamIO, {
      validate: async (_schema, value) => ({ value }),
      scheduleIdle: (_ms, onIdle) => {
        expire = onIdle;
        return () => undefined;
      },
    });
    const source: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ value: 1, done: false }),
        return: async () => {
          closes += 1;
          return { value: undefined, done: true };
        },
      }),
    };
    const make = () =>
      Effect.runSync(
        Effect.provide(
          managedValidatedStreamEffect({
            source,
            schema: z.number(),
            maxItemBytes: 10,
            idleMs: 1000,
            abort: () => {
              throw new Error("observer failed");
            },
            run: (work) => work(),
            settle: async () => {
              settlements += 1;
              finish();
            },
          }),
          layer,
        ),
      );
    make()[Symbol.asyncIterator]();
    expire();
    await settled;
    expect([closes, settlements]).toEqual([1, 1]);
    const iterator = make()[Symbol.asyncIterator]();
    await expect(iterator.return?.()).resolves.toMatchObject({ done: true });
    expect([closes, settlements]).toEqual([2, 2]);
  });
});
