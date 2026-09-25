import { describe, expect, test } from "vitest";
import { Effect, Fiber, Layer } from "effect";
import { z } from "@relkit/schema";
import {
  InvocationTelemetry,
  createStandaloneDispatcher,
  createStandaloneDispatcherEffect,
} from "../src/index.js";
import { invokeStandaloneEffect, StandaloneInvocationFailure } from "../src/standalone-invoke.js";
import type { InvocationOperation } from "../src/index.js";

const target = {
  id: "tasks.run",
  input: z.number(),
  output: z.number(),
  handler: (input: number) => input + 1,
};

describe("standalone invocation Effect", () => {
  test("aborts and releases a pending handler when its fiber is interrupted", async () => {
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    let signal!: AbortSignal;
    const completions: string[] = [];
    let releases = 0;
    const dispatcher = createStandaloneDispatcher();
    const fiber = Effect.runFork(invokeStandaloneEffect({
      target: {
        ...target,
        handler: (_input: number, context: { readonly signal: AbortSignal }) => {
          signal = context.signal;
          started();
          return new Promise<number>(() => undefined);
        },
      },
      input: 1,
    }, {
      onCompletion: ({ outcome }) => { completions.push(outcome); },
      onRelease: () => { releases += 1; },
    }, dispatcher, false));
    await running;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(signal.aborted).toBe(true);
    expect(completions).toEqual(["cancelled"]);
    expect(releases).toBe(1);
  });

  test("does not start a handler after interruption during the start hook", async () => {
    let entered!: () => void;
    let finishHook!: () => void;
    const hookEntered = new Promise<void>((resolve) => { entered = resolve; });
    const hookGate = new Promise<void>((resolve) => { finishHook = resolve; });
    let handlerStarted = false;
    let releases = 0;
    const dispatcher = createStandaloneDispatcher();
    const fiber = Effect.runFork(invokeStandaloneEffect({
      target: { ...target, handler: () => { handlerStarted = true; return 2; } },
      input: 1,
    }, {
      onInvocationStart: () => { entered(); return hookGate; },
      onRelease: () => { releases += 1; },
    }, dispatcher, false));
    await hookEntered;
    await Effect.runPromise(Fiber.interrupt(fiber));
    finishHook();
    await Promise.resolve();
    expect(handlerStarted).toBe(false);
    expect(releases).toBe(1);
  });

  test("dispatches a target and records stable operation names", async () => {
    const seen: InvocationOperation[] = [];
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    const dispatcher = Effect.runSync(Effect.provide(createStandaloneDispatcherEffect(), layer));
    expect(await Effect.runPromise(Effect.provide(
      invokeStandaloneEffect({ target, input: 1 }, {}, dispatcher, false), layer,
    ))).toBe(2);
    expect(seen).toContain("standalone.dispatcher-create");
    expect(seen).toContain("standalone.invoke");
    expect(await createStandaloneDispatcher().dispatch({ target, input: 2 })).toBe(3);
  });

  test("tags validation failure and preserves the public rejection", async () => {
    const dispatcher = createStandaloneDispatcher();
    const failure = await Effect.runPromise(Effect.catchTag(
      invokeStandaloneEffect({ target, input: "bad" }, {}, dispatcher, false),
      "StandaloneInvocationFailure", (error) => Effect.succeed(error),
    ));
    expect(failure).toBeInstanceOf(StandaloneInvocationFailure);
    expect(failure.cause).toMatchObject({ code: "RELKIT_INPUT_VALIDATION" });
    await expect(dispatcher.dispatch({ target, input: "bad" }))
      .rejects.toMatchObject({ code: "RELKIT_INPUT_VALIDATION" });
  });

  test("keeps unexpected clock failure in the defect channel", async () => {
    const defect = new Error("clock unavailable");
    const dispatcher = createStandaloneDispatcher();
    await expect(Effect.runPromise(invokeStandaloneEffect(
      { target, input: 1 },
      { now: () => { throw defect; } },
      dispatcher,
      false,
    ))).rejects.toBe(defect);
  });

  test("starts a stream target only when its first item is requested", async () => {
    let starts = 0;
    const output = {
      kind: "stream" as const,
      item: z.number(),
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: (value: unknown) => ({ value }),
      },
    };
    const dispatcher = createStandaloneDispatcher();
    const stream = await dispatcher.dispatch({
      target: {
        id: "tasks.stream",
        input: z.number(),
        output,
        handler: () => {
          starts++;
          return (async function* () { yield 1; yield 2; })();
        },
      },
      input: 1,
    });
    expect(starts).toBe(0);
    const values: number[] = [];
    for await (const value of stream) values.push(value);
    expect(values).toEqual([1, 2]);
    expect(starts).toBe(1);
  });
});
