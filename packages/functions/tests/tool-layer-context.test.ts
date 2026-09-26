import { expect, test } from "vitest";
import { DispatcherBoundary } from "@relkit/invocation";
import { SchemaValidator, SchemaValidatorLive, z } from "@relkit/schema";
import { Effect, Layer } from "effect";
import { defineFunction } from "../src/define-function.js";
import { createFunctionToolInvokerEffect } from "../src/function-tool-runtime.js";
import { createFunctionToolEffect } from "../src/function-tool.js";
import { asToolEffect } from "../src/function-descriptor-methods.js";
import { FunctionTelemetry, type FunctionOperation } from "../src/function-observability.js";

test("an Effect-created invoker uses services supplied when it runs", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: () => ({ id: "handler" }),
  });
  const operations: FunctionOperation[] = [];
  let dispatches = 0;
  const dispatcher = {
    dispatch: async () => {
      dispatches += 1;
      return { id: "layer" };
    },
  };
  const layer = Layer.mergeAll(
    Layer.succeed(DispatcherBoundary, {
      current: () => dispatcher,
      fallback: () => dispatcher,
    }),
    Layer.succeed(FunctionTelemetry, {
      observe: (operation, effect) => {
        operations.push(operation);
        return effect;
      },
    }),
  );
  const invoke = await Effect.runPromise(
    createFunctionToolInvokerEffect(target, {
      id: "orders.lookup-tool",
      sideEffect: "read",
      approval: "never",
    }),
  );

  await expect(
    Effect.runPromise(
      Effect.provide(invoke({ id: "one" }), Layer.mergeAll(layer, SchemaValidatorLive)),
    ),
  ).resolves.toEqual({ id: "layer" });
  expect(dispatches).toBe(1);
  expect(operations).toContain("tool.invoke");
});

test("an Effect-created tool retains its dispatcher", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: () => ({ id: "handler" }),
  });
  let dispatches = 0;
  const dispatcher = {
    dispatch: async () => {
      dispatches += 1;
      return { id: "layer" };
    },
  };
  const tool = await Effect.runPromise(
    Effect.provide(
      createFunctionToolEffect({
        id: "orders.lookup-tool",
        target,
        description: "Look up an order",
        sideEffect: "read",
        approval: "never",
      }),
      Layer.succeed(DispatcherBoundary, {
        current: () => dispatcher,
        fallback: () => dispatcher,
      }),
    ),
  );

  const invokeLayer = Layer.mergeAll(
    SchemaValidatorLive,
    Layer.succeed(DispatcherBoundary, {
      current: () => dispatcher,
      fallback: () => dispatcher,
    }),
  );
  await expect(
    Effect.runPromise(Effect.provide(tool.invokeEffect({ id: "one" }), invokeLayer)),
  ).resolves.toEqual({ id: "layer" });
  expect(dispatches).toBe(1);
});

test("an Effect-created invoker uses a supplied schema validator", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: ({ id }) => ({ id }),
  });
  let validations = 0;
  const invoke = await Effect.runPromise(
    createFunctionToolInvokerEffect(target, {
      id: "orders.lookup-tool",
      sideEffect: "read",
      approval: "never",
    }),
  );

  await expect(
    Effect.runPromise(
      Effect.provide(
        invoke({ id: "original" }),
        Layer.succeed(SchemaValidator, {
          validate: () => {
            validations += 1;
            return { value: { id: "validated" } };
          },
        }),
      ),
    ),
  ).resolves.toEqual({ id: "validated" });
  expect(validations).toBe(1);
});

test("a derived tool resolves the dispatcher at invocation time", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: () => ({ id: "handler" }),
    tool: { description: "Lookup", sideEffect: "read", approval: "never" },
  });
  const dispatcher = { dispatch: async () => ({ id: "invocation-layer" }) };
  const layer = Layer.mergeAll(
    SchemaValidatorLive,
    Layer.succeed(DispatcherBoundary, {
      current: () => dispatcher,
      fallback: () => dispatcher,
    }),
  );
  const tool = await Effect.runPromise(asToolEffect(target, target, target.tool));
  await expect(
    Effect.runPromise(Effect.provide(tool.invokeEffect({ id: "one" }), layer)),
  ).resolves.toEqual({ id: "invocation-layer" });
  await expect(tool.invoke({ id: "one" })).resolves.toEqual({ id: "handler" });
});

test("a deferred invoker acquires and releases a scoped dispatcher per call", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: () => ({ id: "handler" }),
  });
  let acquisitions = 0;
  let releases = 0;
  const dispatcherLayer = Layer.effect(
    DispatcherBoundary,
    Effect.acquireRelease(
      Effect.sync(() => {
        acquisitions += 1;
        const dispatcher = { dispatch: async () => ({ id: `live-${acquisitions}` }) };
        return { current: () => dispatcher, fallback: () => dispatcher };
      }),
      () =>
        Effect.sync(() => {
          releases += 1;
        }),
    ),
  );
  const invoke = await Effect.runPromise(
    createFunctionToolInvokerEffect(target, {
      id: "orders.lookup-tool",
      sideEffect: "read",
      approval: "never",
    }),
  );
  const layer = Layer.mergeAll(SchemaValidatorLive, dispatcherLayer);
  await expect(Effect.runPromise(Effect.provide(invoke({ id: "one" }), layer))).resolves.toEqual({
    id: "live-1",
  });
  expect(releases).toBe(1);
  await expect(Effect.runPromise(Effect.provide(invoke({ id: "two" }), layer))).resolves.toEqual({
    id: "live-2",
  });
  expect(acquisitions).toBe(2);
  expect(releases).toBe(2);
});
