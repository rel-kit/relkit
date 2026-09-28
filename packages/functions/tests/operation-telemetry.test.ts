import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Effect, Exit, Layer } from "effect";
import { defineErrorEffect } from "../src/define-error.js";
import { defineFunction } from "../src/define-function.js";
import { FunctionTelemetry, type FunctionOperation } from "../src/function-observability.js";
import { createFunctionToolEffect } from "../src/function-tool.js";

test("composite operations emit one outcome for their own telemetry label", async () => {
  const outcomes: Array<{ operation: FunctionOperation; failed: boolean }> = [];
  const telemetry = Layer.succeed(FunctionTelemetry, {
    observe: (operation, effect) =>
      Effect.onExit(effect, (exit) =>
        Effect.sync(() => {
          outcomes.push({ operation, failed: Exit.isFailure(exit) });
        }),
      ),
  });
  const target = defineFunction({
    id: "orders.lookup",
    input: z.string(),
    output: z.string(),
    handler: (value) => value,
  });
  await Effect.runPromise(
    Effect.provide(
      createFunctionToolEffect({
        id: "orders.lookup-tool",
        target,
        description: "Lookup",
        sideEffect: "read",
        approval: "never",
      }),
      telemetry,
    ),
  );
  const retryExit = await Effect.runPromiseExit(
    Effect.provide(
      defineErrorEffect({
        id: "orders.bad-retry",
        data: z.string(),
        message: "Missing",
        retry: "soon" as never,
      }),
      telemetry,
    ),
  );

  expect(Exit.isFailure(retryExit)).toBe(true);
  expect(outcomes.filter(({ operation }) => operation === "tool.create")).toEqual([
    { operation: "tool.create", failed: false },
  ]);
  expect(outcomes.filter(({ operation }) => operation === "error.define")).toEqual([
    { operation: "error.define", failed: true },
  ]);
});
