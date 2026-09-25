import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { z } from "@relkit/schema";
import { ManagedStreamIO, managedValidatedStreamEffect } from "../src/index.js";
import type { ManagedStreamOptions } from "../src/managed-stream.types.js";

function options(source: AsyncIterable<unknown>, overrides: Partial<ManagedStreamOptions> = {}): ManagedStreamOptions {
  return {
    source,
    schema: z.unknown(),
    maxItemBytes: 100,
    idleMs: 1000,
    abort: () => undefined,
    run: (work) => work(),
    settle: async () => undefined,
    ...overrides,
  };
}

function source(next: () => Promise<IteratorResult<unknown>>, close?: () => Promise<IteratorResult<unknown>>): AsyncIterable<unknown> {
  return { [Symbol.asyncIterator]: () => ({ next, return: close }) };
}

describe("managed stream failures", () => {
  test("preserves source failure after closing and settling", async () => {
    const cause = new Error("source failed");
    const closeCause = new Error("close failed");
    let closed = 0;
    let settled: unknown;
    const stream = Effect.runSync(managedValidatedStreamEffect(options(
      source(async () => { throw cause; }, async () => { closed++; throw closeCause; }),
      { settle: async (error) => { settled = error; } },
    )));
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toBe(cause);
    expect(closed).toBe(1);
    expect(settled).toBe(cause);
  });

  test("tags validation, encoding, and item size failures", async () => {
    const validatorCause = new Error("validator failed");
    const rejecting = Layer.succeed(ManagedStreamIO, {
      validate: async () => { throw validatorCause; },
      scheduleIdle: () => () => undefined,
    });
    const item = source(async () => ({ value: 1, done: false }));
    const invalid = Effect.runSync(Effect.provide(managedValidatedStreamEffect(options(item)), rejecting));
    await expect(invalid[Symbol.asyncIterator]().next()).rejects.toBe(validatorCause);

    const passthrough = Layer.succeed(ManagedStreamIO, {
      validate: async (_schema, value) => ({ value }),
      scheduleIdle: () => () => undefined,
    });
    const bigint = Effect.runSync(Effect.provide(managedValidatedStreamEffect(options(
      source(async () => ({ value: 1n, done: false })),
    )), passthrough));
    await expect(bigint[Symbol.asyncIterator]().next()).rejects.toThrow(TypeError);
    const oversized = Effect.runSync(Effect.provide(managedValidatedStreamEffect(options(
      source(async () => ({ value: "long", done: false })), { maxItemBytes: 1 },
    )), passthrough));
    await expect(oversized[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: "RELKIT_STREAM_ITEM_TOO_LARGE",
    });
  });

  test("keeps settlement and return failures visible", async () => {
    const settleCause = new Error("settle failed");
    const completed = Effect.runSync(managedValidatedStreamEffect(options(
      source(async () => ({ value: undefined, done: true })),
      { settle: async () => { throw settleCause; } },
    )));
    await expect(completed[Symbol.asyncIterator]().next()).rejects.toBe(settleCause);

    const returnCause = new Error("close failed");
    const open = Effect.runSync(managedValidatedStreamEffect(options(source(
      async () => ({ value: 1, done: false }),
      async () => { throw returnCause; },
    ))));
    await expect(open[Symbol.asyncIterator]().return?.()).rejects.toBe(returnCause);
  });
});
