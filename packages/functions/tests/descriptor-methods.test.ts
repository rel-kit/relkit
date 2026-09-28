import { describe, expect, test } from "vitest";
import {
  DispatcherBoundary,
  type InvocationDispatchRequest,
  type InvocationDispatcher,
} from "@relkit/invocation";
import { z } from "@relkit/schema";
import { Cause, Effect, Exit, Layer } from "effect";
import { defineFunction } from "../src/define-function.js";
import {
  asGraphNodeEffect,
  asToolEffect,
  invokeDescriptorEffect,
} from "../src/function-descriptor-methods.js";
import { FunctionOperationError } from "../src/function-observability.js";

const input = z.object({ id: z.string() });
const output = z.object({ id: z.string() });

describe("callable descriptor Effect methods", () => {
  test("uses a supplied dispatcher boundary for direct invocation", async () => {
    const requests: unknown[] = [];
    const dispatcher: InvocationDispatcher = {
      dispatch: async <Input, Output, Context extends { readonly signal: AbortSignal }>(
        request: InvocationDispatchRequest<Input, Output, Context>,
      ): Promise<Output> => {
        requests.push(request);
        return { id: "layer" } as Output;
      },
    };
    const boundary = Layer.succeed(DispatcherBoundary, {
      current: () => dispatcher,
      fallback: () => dispatcher,
    });
    const fn = defineFunction({
      id: "orders.lookup",
      input,
      output,
      handler: () => ({ id: "handler" }),
    });
    const result = await Effect.runPromise(
      Effect.provide(invokeDescriptorEffect(fn, fn, { id: "one" }), boundary),
    );
    expect(result).toEqual({ id: "layer" });
    expect(requests).toHaveLength(1);
    await expect(fn.invoke({ id: "two" })).resolves.toEqual({ id: "handler" });
  });

  test("preserves dispatch failure in the tagged Effect channel", async () => {
    const dispatcher: InvocationDispatcher = {
      dispatch: async () => {
        throw new TypeError("dispatch failed");
      },
    };
    const boundary = Layer.succeed(DispatcherBoundary, {
      current: () => dispatcher,
      fallback: () => dispatcher,
    });
    const fn = defineFunction({
      id: "orders.lookup",
      input,
      output,
      handler: ({ id }) => ({ id }),
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(invokeDescriptorEffect(fn, fn, { id: "one" }), boundary),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.squash(exit.cause);
      expect(failure).toBeInstanceOf(FunctionOperationError);
      expect((failure as FunctionOperationError).cause).toEqual(new TypeError("dispatch failed"));
    }
  });

  test("derives tool and graph views through Effect", async () => {
    const fn = defineFunction({
      id: "orders.lookup",
      input,
      output,
      handler: ({ id }) => ({ id }),
      tool: { description: "Lookup order", sideEffect: "read", approval: "never" },
    });
    const tool = await Effect.runPromise(asToolEffect(fn, fn, fn.tool));
    expect(tool.id).toBe("orders.lookup.tool");
    const node = await Effect.runPromise(asGraphNodeEffect(fn, fn, { id: "lookup" }));
    expect(node.id).toBe("lookup");
    const exit = await Effect.runPromiseExit(asToolEffect(fn, fn, undefined));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(Cause.squash(exit.cause)).toBeInstanceOf(FunctionOperationError);
  });
});
