import { describe, expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Effect, Layer } from "effect";
import {
  InvocationTelemetry,
  isStreamOutput,
  lazySingleConsumerStream,
  lazySingleConsumerStreamEffect,
  managedValidatedStream,
} from "../src/index.js";
import type { InvocationOperation } from "../src/index.js";

describe("invocation streams", () => {
  test("starts lazily and allows one consumer", async () => {
    let starts = 0;
    const stream = lazySingleConsumerStream(async () => {
      starts += 1;
      return (async function* () {
        yield 1;
        yield 2;
      })();
    });
    expect(starts).toBe(0);
    const values: number[] = [];
    for await (const value of stream) values.push(value);
    expect(values).toEqual([1, 2]);
    expect(starts).toBe(1);
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: "RELKIT_STREAM_ALREADY_CONSUMED",
    });
  });

  test("does not start a lazy stream when a consumer returns immediately", async () => {
    let starts = 0;
    const stream = lazySingleConsumerStream(async () => {
      starts += 1;
      return (async function* () { yield 1; })();
    });
    const iterator = stream[Symbol.asyncIterator]();
    expect(await iterator.return?.("closed")).toEqual({ value: "closed", done: true });
    expect(starts).toBe(0);
  });

  test("exposes typed lazy iteration and telemetry through Effect", async () => {
    const seen: InvocationOperation[] = [];
    const telemetry = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    const stream = Effect.runSync(
      Effect.provide(
        lazySingleConsumerStreamEffect(async () => (async function* () { yield 3; })()),
        telemetry,
      ),
    );
    const iterator = stream[Symbol.asyncIterator]();
    expect(await Effect.runPromise(Effect.provide(iterator.nextEffect(), telemetry))).toEqual({
      value: 3,
      done: false,
    });
    const second = stream[Symbol.asyncIterator]();
    const code = await Effect.runPromise(
      Effect.provide(
        Effect.catchTag(second.nextEffect(), "StreamLifecycleFailure", (error) =>
          Effect.succeed(error.code),
        ),
        telemetry,
      ),
    );
    expect(code).toBe("RELKIT_STREAM_ALREADY_CONSUMED");
    expect(seen).toEqual(["stream.lazy-create", "stream.lazy-next", "stream.lazy-next"]);
  });

  test("validates values, preserves order, and settles once", async () => {
    const events: string[] = [];
    const source = (async function* () {
      events.push("start");
      yield 1;
      yield 2;
      events.push("source-end");
    })();
    const stream = managedValidatedStream<number>({
      source,
      schema: z.number(),
      maxItemBytes: 10,
      idleMs: 1000,
      abort: () => events.push("abort"),
      run: (work) => work(),
      settle: async () => { events.push("settle"); },
    });
    const values: number[] = [];
    for await (const value of stream) values.push(value);
    expect(values).toEqual([1, 2]);
    expect(events).toEqual(["start", "source-end", "settle"]);
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: "RELKIT_STREAM_ALREADY_CONSUMED",
    });
  });

  test("aborts, closes, and settles on an invalid item", async () => {
    const events: string[] = [];
    const source = (async function* () {
      try { yield "wrong"; }
      finally { events.push("source-return"); }
    })();
    const stream = managedValidatedStream<number>({
      source,
      schema: z.number(),
      maxItemBytes: 10,
      idleMs: 1000,
      abort: () => events.push("abort"),
      run: (work) => work(),
      settle: async () => { events.push("settle"); },
    });
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow(
      "Stream item validation failed",
    );
    expect(events).toEqual(["abort", "source-return", "settle"]);
  });

  test("rejects oversized items and supports consumer cancellation", async () => {
    const aborted: unknown[] = [];
    let settlements = 0;
    const stream = managedValidatedStream<string>({
      source: (async function* () { yield "x".repeat(20); })(),
      schema: z.string(),
      maxItemBytes: 10,
      idleMs: 1000,
      abort: (reason) => aborted.push(reason),
      run: (work) => work(),
      settle: async () => { settlements += 1; },
    });
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: "RELKIT_STREAM_ITEM_TOO_LARGE",
    });
    expect(aborted).toHaveLength(1);
    expect(settlements).toBe(1);

    const cancelled = managedValidatedStream<number>({
      source: (async function* () { yield 1; })(),
      schema: z.number(),
      maxItemBytes: 10,
      idleMs: 1000,
      abort: (reason) => aborted.push(reason),
      run: (work) => work(),
      settle: async () => { settlements += 1; },
    });
    const iterator = cancelled[Symbol.asyncIterator]();
    expect(await iterator.return?.("stop")).toEqual({ value: "stop", done: true });
    expect(aborted.at(-1)).toMatchObject({ name: "AbortError" });
    expect(settlements).toBe(2);
  });

  test("recognizes stream output descriptors", () => {
    expect(isStreamOutput({ kind: "stream", item: z.number() })).toBe(true);
    expect(isStreamOutput({ kind: "stream", item: null })).toBe(false);
    expect(isStreamOutput(null)).toBe(false);
  });
});
