import { describe, expect, test } from "vitest";
import {
  DispatcherBoundary,
  InvocationDispatchFailure,
  dispatchInvocation,
  dispatchInvocationEffect,
  type InvocationDispatchRequest,
  type InvocationDispatcher,
} from "../../src/invocation/index.js";
import { z } from "../../src/schema/index.js";
import { Cause, Effect, Exit, Layer } from "effect";
import { defineFunction } from "../../src/functions/define-function.js";
import {
  asGraphNodeEffect,
  asToolEffect,
} from "../../src/functions/function-descriptor-methods.js";
import { FunctionOperationError } from "../../src/functions/function-observability.js";

const input = z.object({ id: z.string() });
const output = z.object({ id: z.string() });

describe("callable descriptor Effect methods", () => {
  test("dispatches a function descriptor through a supplied dispatcher boundary", async () => {
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
    expect("invoke" in fn).toBe(false);
    const result = await Effect.runPromise(
      Effect.provide(dispatchInvocationEffect({ target: fn, input: { id: "one" } }), boundary),
    );
    expect(result).toEqual({ id: "layer" });
    expect(requests).toHaveLength(1);
    await expect(dispatchInvocation({ target: fn, input: { id: "two" } })).resolves.toEqual({
      id: "handler",
    });
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
      Effect.provide(dispatchInvocationEffect({ target: fn, input: { id: "one" } }), boundary),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.squash(exit.cause);
      expect(failure).toBeInstanceOf(InvocationDispatchFailure);
      expect((failure as InvocationDispatchFailure).cause).toEqual(
        new TypeError("dispatch failed"),
      );
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
