import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { z } from "@relkit/schema";
import {
  InvocationTelemetry,
  baseExecutionContext,
  baseExecutionContextEffect,
  invokeFunctionLifecycle,
  invokeValueHook,
} from "../src/index.js";
import type { InvocationOperation } from "../src/index.js";

describe("invocation lifecycle Effect", () => {
  test("runs dependent hooks and handler in order with telemetry", async () => {
    const calls: string[] = [];
    const observed: InvocationOperation[] = [];
    const context = { signal: new AbortController().signal, env: { mode: "test" } };
    const target = {
      id: "tasks.run",
      input: z.number(),
      output: z.number(),
      onBefore: (input: number) => {
        calls.push("before");
        return input + 1;
      },
      handler: (input: number) => {
        calls.push("handler");
        return input * 2;
      },
      onAfter: (output: number) => {
        calls.push("after");
        return output + 1;
      },
    };
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        observed.push(operation);
        return effect;
      },
    });
    expect(
      await Effect.runPromise(
        Effect.provide(
          invokeFunctionLifecycle({
            target,
            input: 1,
            context,
          }),
          layer,
        ),
      ),
    ).toBe(5);
    expect(calls).toEqual(["before", "handler", "after"]);
    expect(observed).toContain("lifecycle.function");
    expect(
      await Effect.runPromise(
        invokeValueHook({
          hook: (value: number) => value + 1,
          value: 2,
          schema: z.number(),
          context,
        }),
      ),
    ).toBe(3);
  });

  test("builds restricted context through Effect and rejects nonvoid event output", async () => {
    const context = { signal: new AbortController().signal, env: {}, extra: "private" };
    const base = Effect.runSync(baseExecutionContextEffect(context));
    expect(base).toEqual(baseExecutionContext(context));
    expect("extra" in base).toBe(false);
    const failure = await Effect.runPromise(
      Effect.catchTag(
        invokeFunctionLifecycle({
          target: {
            id: "events.posted",
            invocationMode: "event-only",
            input: z.number(),
            output: z.number(),
            handler: () => 1,
          },
          input: 1,
          context,
        }),
        "UnexpectedDefect",
        (error) => Effect.succeed(error),
      ),
    );
    expect(failure).toMatchObject({ _tag: "UnexpectedDefect" });
  });
});
