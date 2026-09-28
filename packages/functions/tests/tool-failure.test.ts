import { expect, test } from "vitest";
import { DispatcherBoundary } from "@relkit/invocation";
import { SchemaValidatorLive, z } from "@relkit/schema";
import { Cause, Effect, Exit, Layer } from "effect";
import { defineFunction } from "../src/define-function.js";
import { FunctionOperationError } from "../src/function-observability.js";
import { createFunctionTool } from "../src/function-tool.js";
import { invokeFunctionToolEffect } from "../src/function-tool-runtime.js";

const input = z.object({ id: z.string() });
const output = z.object({ id: z.string() });

test("dispatch failures remain tagged in Effect and retain the runtime's public error", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input,
    output,
    handler: () => {
      throw new Error("backend unavailable");
    },
  });
  const metadata = {
    id: "orders.lookup-tool",
    sideEffect: "read" as const,
    approval: "never" as const,
  };
  const dispatcher = Layer.succeed(DispatcherBoundary, {
    current: () => undefined,
    fallback: () => ({
      dispatch: async () => {
        throw new Error("backend unavailable");
      },
    }),
  });
  const exit = await Effect.runPromiseExit(
    invokeFunctionToolEffect(target, metadata, { id: "one" }).pipe(
      Effect.provide(Layer.mergeAll(SchemaValidatorLive, dispatcher)),
    ),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Cause.squash(exit.cause);
    expect(failure).toBeInstanceOf(FunctionOperationError);
    expect((failure as FunctionOperationError).cause).toMatchObject({
      message: "backend unavailable",
    });
  }
  const tool = createFunctionTool({
    ...metadata,
    target,
    description: "Lookup order",
  });
  await expect(tool.invoke({ id: "one" })).rejects.toThrow("Unexpected internal error");
});

test("approval callback rejection preserves its original error", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input,
    output,
    handler: ({ id }) => ({ id }),
  });
  const tool = createFunctionTool({
    id: "orders.lookup-tool",
    target,
    description: "Lookup order",
    sideEffect: "read",
    approval: "always",
  });
  await expect(
    tool.invoke(
      { id: "one" },
      {
        approval: async () => {
          throw new Error("resolver failed");
        },
      },
    ),
  ).rejects.toThrow("resolver failed");
});
