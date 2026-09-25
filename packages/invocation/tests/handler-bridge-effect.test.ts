import { describe, expect, test, vi } from "vitest";
import { Effect, Layer } from "effect";
import { InvocationTelemetry, invokeUserHandler } from "../src/index.js";
import type { InvocationOperation } from "../src/index.js";

describe("handler bridge Effect", () => {
  test("observes successful Promise and Effect handler values", async () => {
    const observed: InvocationOperation[] = [];
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        observed.push(operation);
        return effect;
      },
    });
    const context = { signal: new AbortController().signal };
    const promise = invokeUserHandler({
      handler: async (value: number) => value + 1,
      input: 1,
      publicContext: context,
    });
    expect(await Effect.runPromise(Effect.provide(promise, layer))).toBe(2);
    const effect = invokeUserHandler({
      handler: (value: number) => Effect.succeed(value + 2) as never,
      input: 1,
      publicContext: context,
    });
    expect(await Effect.runPromise(Effect.provide(effect, layer))).toBe(3);
    expect(observed.filter((operation) => operation === "handler.invoke")).toHaveLength(2);
  });

  test("turns a thrown handler error into an invocation failure", async () => {
    const context = { signal: new AbortController().signal };
    const failure = await Effect.runPromise(
      Effect.catchTag(
        invokeUserHandler({
          handler: () => {
            throw new Error("private");
          },
          input: 1,
          publicContext: context,
        }),
        "UnexpectedDefect",
        (error) => Effect.succeed(error),
      ),
    );
    expect(failure).toMatchObject({
      _tag: "UnexpectedDefect",
      code: "RELKIT_UNEXPECTED_DEFECT",
    });
  });

  test("normalizes a timed handler failure through the deadline boundary", async () => {
    const context = { signal: new AbortController().signal };
    await expect(
      Effect.runPromise(
        invokeUserHandler({
          handler: async () => {
            throw new Error("private");
          },
          input: 1,
          publicContext: context,
          timeoutMs: 100,
        }),
      ),
    ).rejects.toMatchObject({ _tag: "UnexpectedDefect" });
  });

  test("releases the abort bridge when the signal hook throws", async () => {
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, "removeEventListener");
    let started = false;
    const result = invokeUserHandler({
      handler: () => {
        started = true;
        return 1;
      },
      input: 1,
      publicContext: { signal: parent.signal },
      onSignal: () => {
        throw new Error("signal hook failed");
      },
    });
    await expect(Effect.runPromise(result)).rejects.toMatchObject({ _tag: "UnexpectedDefect" });
    expect(started).toBe(false);
    expect(remove).toHaveBeenCalled();
    remove.mockRestore();
  });
});
