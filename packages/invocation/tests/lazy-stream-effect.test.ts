import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { lazySingleConsumerStreamEffect, StreamSourceFailure } from "../src/index.js";

describe("lazy stream Effect edges", () => {
  test("return before first demand does not start the source", async () => {
    let starts = 0;
    const stream = Effect.runSync(
      lazySingleConsumerStreamEffect(async () => {
        starts += 1;
        return {
          async *[Symbol.asyncIterator]() {
            yield 1;
          },
        };
      }),
    );
    const iterator = stream[Symbol.asyncIterator]();
    expect(await Effect.runPromise(iterator.returnEffect(9))).toEqual({ value: 9, done: true });
    expect(starts).toBe(0);
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: "RELKIT_STREAM_ALREADY_CONSUMED",
    });
  });

  test("tags an unsupported throw and preserves the public cause", async () => {
    const cause = new Error("stop");
    const stream = Effect.runSync(
      lazySingleConsumerStreamEffect(async () => ({
        [Symbol.asyncIterator]() {
          return { next: async () => ({ value: 1, done: false as const }) };
        },
      })),
    );
    const iterator = stream[Symbol.asyncIterator]();
    const failure = await Effect.runPromise(
      Effect.catchTag(iterator.throwEffect(cause), "StreamSourceFailure", (error) =>
        Effect.succeed(error),
      ),
    );
    expect(failure).toBeInstanceOf(StreamSourceFailure);
    expect(failure.cause).toBe(cause);
    await expect(iterator.throw(cause)).rejects.toBe(cause);
  });

  test("delegates next, return, and throw to one lazily opened iterator", async () => {
    let starts = 0;
    const stream = Effect.runSync(
      lazySingleConsumerStreamEffect(async () => {
        starts++;
        return {
          [Symbol.asyncIterator]() {
            return {
              next: async () => ({ value: 1, done: false as const }),
              return: async (value?: unknown) => ({ value: value as number, done: true as const }),
              throw: async (error?: unknown) => ({ value: error as number, done: true as const }),
            };
          },
        };
      }),
    );
    const iterator = stream[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: 1, done: false });
    expect(await Effect.runPromise(iterator.returnEffect(2))).toEqual({ value: 2, done: true });
    expect(await Effect.runPromise(iterator.throwEffect(3))).toEqual({ value: 3, done: true });
    expect(starts).toBe(1);
    const second = stream[Symbol.asyncIterator]();
    await expect(Effect.runPromise(second.nextEffect())).rejects.toMatchObject({
      code: "RELKIT_STREAM_ALREADY_CONSUMED",
    });
    await expect(second.return()).rejects.toMatchObject({ code: "RELKIT_STREAM_ALREADY_CONSUMED" });
    await expect(second.throw()).rejects.toMatchObject({ code: "RELKIT_STREAM_ALREADY_CONSUMED" });
  });

  test("tags a source failure from the first demand", async () => {
    const cause = new Error("open failed");
    const stream = Effect.runSync(
      lazySingleConsumerStreamEffect(async () => {
        throw cause;
      }),
    );
    const iterator = stream[Symbol.asyncIterator]();
    const failure = await Effect.runPromise(
      Effect.catchTag(iterator.nextEffect(), "StreamSourceFailure", (error) =>
        Effect.succeed(error),
      ),
    );
    expect(failure).toBeInstanceOf(StreamSourceFailure);
    expect(failure.cause).toBe(cause);
  });

  test("returns a completed result when an opened source has no return method", async () => {
    const stream = Effect.runSync(
      lazySingleConsumerStreamEffect(async () => ({
        [Symbol.asyncIterator]: () => ({ next: async () => ({ value: 1, done: false as const }) }),
      })),
    );
    const iterator = stream[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: 1, done: false });
    expect(await iterator.return?.(7)).toEqual({ value: 7, done: true });
  });

  test("tags a source return failure and preserves the public cause", async () => {
    const cause = new Error("return failed");
    const stream = Effect.runSync(
      lazySingleConsumerStreamEffect(async () => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ value: 1, done: false as const }),
          return: async () => {
            throw cause;
          },
        }),
      })),
    );
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();
    const failure = await Effect.runPromise(
      Effect.catchTag(iterator.returnEffect(), "StreamSourceFailure", (error) =>
        Effect.succeed(error),
      ),
    );
    expect(failure).toBeInstanceOf(StreamSourceFailure);
    expect(failure.cause).toBe(cause);
    await expect(iterator.return?.()).rejects.toBe(cause);
  });
});
