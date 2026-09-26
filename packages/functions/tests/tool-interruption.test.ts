import { expect, test } from "vitest";
import { AbortIO, DispatcherBoundary } from "@relkit/invocation";
import { SchemaValidatorLive, z } from "@relkit/schema";
import { Effect, Fiber, Layer } from "effect";
import { defineFunction } from "../src/define-function.js";
import { invokeFunctionToolEffect } from "../src/function-tool-runtime.js";

function makeTarget(onStart: () => void) {
  return defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: ({ id }) => {
      onStart();
      return { id };
    },
  });
}

test("interrupting exported tool approval aborts its signal before dispatch", async () => {
  let starts = 0;
  const target = makeTarget(() => {
    starts += 1;
  });
  const ready = Promise.withResolvers<void>();
  let approvalSignal: AbortSignal | undefined;
  let activeListeners = 0;
  const abortIO = Layer.succeed(AbortIO, {
    createController: () => new AbortController(),
    listen: (signal, onAbort) => {
      activeListeners += 1;
      signal.addEventListener("abort", onAbort, { once: true });
      return () => {
        activeListeners -= 1;
        signal.removeEventListener("abort", onAbort);
      };
    },
  });
  const fiber = Effect.runFork(
    Effect.provide(
      invokeFunctionToolEffect(
        target,
        { id: "orders.tool", sideEffect: "read", approval: "always" },
        { id: "one" },
        {
          approval: (_request, signal) => {
            approvalSignal = signal;
            ready.resolve();
            return new Promise<boolean>(() => {});
          },
        },
      ),
      Layer.mergeAll(SchemaValidatorLive, abortIO),
    ),
  );
  await ready.promise;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(approvalSignal?.aborted).toBe(true);
  expect(activeListeners).toBe(0);
  expect(starts).toBe(0);
});

test("interrupting exported tool dispatch aborts the underlying dispatcher", async () => {
  let starts = 0;
  const target = makeTarget(() => {
    starts += 1;
  });
  const ready = Promise.withResolvers<void>();
  let dispatchSignal: AbortSignal | undefined;
  const dispatch = {
    dispatch: async (request: { options?: { signal?: AbortSignal } }) => {
      dispatchSignal = request.options?.signal;
      ready.resolve();
      return await new Promise<{ id: string }>(() => {});
    },
  };
  const boundary = Layer.succeed(DispatcherBoundary, {
    current: () => dispatch,
    fallback: () => dispatch,
  });
  const fiber = Effect.runFork(
    Effect.provide(
      invokeFunctionToolEffect(
        target,
        { id: "orders.tool", sideEffect: "read", approval: "never" },
        { id: "one" },
      ),
      Layer.mergeAll(SchemaValidatorLive, boundary),
    ),
  );
  await ready.promise;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(dispatchSignal?.aborted).toBe(true);
  expect(starts).toBe(0);
});
