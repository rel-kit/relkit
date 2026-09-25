import { describe, expect, test } from "vitest";
import { Effect, Fiber, Layer } from "effect";
import { z } from "@relkit/schema";
import { ManagedStreamIO, managedValidatedStreamEffect } from "../src/index.js";

describe("managed stream interruption", () => {
  test("closes and settles a source after a pending pull is interrupted", async () => {
    let started!: () => void;
    const pulling = new Promise<void>((resolve) => { started = resolve; });
    let closed = 0;
    let settled = 0;
    let idleCancelled = 0;
    const abortReasons: unknown[] = [];
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: () => { started(); return new Promise<IteratorResult<number>>(() => undefined); },
        return: async () => { closed += 1; return { value: undefined, done: true }; },
      }),
    };
    const io = Layer.succeed(ManagedStreamIO, {
      validate: async (_schema, value) => ({ value }),
      scheduleIdle: () => () => { idleCancelled += 1; },
    });
    const stream = Effect.runSync(Effect.provide(managedValidatedStreamEffect<number>({
      source,
      schema: z.number(),
      maxItemBytes: 100,
      idleMs: 1_000,
      abort: (reason) => { abortReasons.push(reason); },
      run: (work) => work(),
      settle: async () => { settled += 1; },
    }), io));
    const iterator = stream[Symbol.asyncIterator]();
    const fiber = Effect.runFork(iterator.nextEffect());
    await pulling;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(closed).toBe(1);
    expect(settled).toBe(1);
    expect(idleCancelled).toBeGreaterThan(0);
    expect(abortReasons).toHaveLength(1);
    expect(abortReasons[0]).toMatchObject({ name: "AbortError" });
    await expect(Effect.runPromise(iterator.nextEffect())).rejects.toMatchObject({
      _tag: "StreamSourceFailure",
    });
  });
});
