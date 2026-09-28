import { describe, expect, test, vi } from "vitest";
import { DispatcherBoundary } from "@relkit/invocation";
import { SchemaValidatorLive, z } from "@relkit/schema";
import { Cause, Effect, Exit, Layer } from "effect";
import { defineFunction } from "../src/define-function.js";
import { createFunctionTool } from "../src/function-tool.js";
import {
  FunctionToolApprovalDeniedError,
  FunctionToolApprovalRequiredError,
  FunctionToolArgumentValidationError,
  FunctionToolOperationCancelledError,
  FunctionToolArgumentFailure,
  invokeFunctionToolEffect,
} from "../src/function-tool-runtime.js";

function makeTarget() {
  let starts = 0;
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: ({ id }) => {
      starts += 1;
      return { id };
    },
  });
  return { target, starts: () => starts };
}

describe("function tool runtime", () => {
  test("validates, approves, and dispatches through the compatibility API", async () => {
    const { target, starts } = makeTarget();
    const tool = createFunctionTool({
      id: "orders.lookup-tool",
      target,
      description: "Look up an order",
      sideEffect: "read",
      approval: "always",
    });
    await expect(tool.invoke({ id: "one" })).rejects.toBeInstanceOf(
      FunctionToolApprovalRequiredError,
    );
    await expect(tool.invoke({ id: "one" }, { approval: () => "denied" })).rejects.toBeInstanceOf(
      FunctionToolApprovalDeniedError,
    );
    await expect(tool.invoke({ id: "one" }, { approval: () => "approved" })).resolves.toEqual({
      id: "one",
    });
    expect(starts()).toBe(1);
  });

  test("keeps argument errors and cancellation shapes", async () => {
    const { target, starts } = makeTarget();
    const tool = createFunctionTool({
      id: "orders.lookup-tool",
      target,
      description: "Look up an order",
      sideEffect: "read",
      approval: "never",
    });
    await expect(tool.invoke({ id: 1 } as never)).rejects.toBeInstanceOf(
      FunctionToolArgumentValidationError,
    );
    const controller = new AbortController();
    controller.abort();
    await expect(tool.invoke({ id: "one" }, { signal: controller.signal })).rejects.toBeInstanceOf(
      FunctionToolOperationCancelledError,
    );
    expect(starts()).toBe(0);
  });

  test("exposes tagged failures and substitutes dispatch with a Layer", async () => {
    const { target, starts } = makeTarget();
    const calls: unknown[] = [];
    const dispatcher = Layer.succeed(DispatcherBoundary, {
      current: () => undefined,
      fallback: () => ({
        dispatch: async (request) => {
          calls.push(request.input);
          return request.input as never;
        },
      }),
    });
    const metadata = {
      id: "orders.lookup-tool",
      sideEffect: "read" as const,
      approval: "never" as const,
    };
    const result = await Effect.runPromise(
      invokeFunctionToolEffect(target, metadata, { id: "layer" }).pipe(
        Effect.provide(Layer.mergeAll(SchemaValidatorLive, dispatcher)),
      ),
    );
    expect(result).toEqual({ id: "layer" });
    expect(calls).toEqual([{ id: "layer" }]);
    expect(starts()).toBe(0);

    const exit = await Effect.runPromiseExit(
      invokeFunctionToolEffect(target, metadata, { id: 1 } as never).pipe(
        Effect.provide(SchemaValidatorLive),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(Cause.squash(exit.cause)).toBeInstanceOf(FunctionToolArgumentFailure);
  });

  test("removes the approval listener after a synchronous decision", async () => {
    const { target } = makeTarget();
    const tool = createFunctionTool({
      id: "orders.lookup-tool",
      target,
      description: "Look up an order",
      sideEffect: "read",
      approval: "always",
    });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(
      tool.invoke(
        { id: "one" },
        {
          signal: controller.signal,
          approval: () => true,
        },
      ),
    ).resolves.toEqual({ id: "one" });
    expect(remove).toHaveBeenCalled();
    const removals = remove.mock.calls.length;
    controller.abort();
    expect(remove.mock.calls.length).toBe(removals);
  });

  test("cancels a pending approval and never starts work later", async () => {
    const { target, starts } = makeTarget();
    const tool = createFunctionTool({
      id: "orders.lookup-tool",
      target,
      description: "Look up an order",
      sideEffect: "read",
      approval: "always",
    });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const ready = Promise.withResolvers<void>();
    const decision = Promise.withResolvers<boolean>();
    const pending = tool.invoke(
      { id: "one" },
      {
        signal: controller.signal,
        approval: () => {
          ready.resolve();
          return decision.promise;
        },
      },
    );
    await ready.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(remove).toHaveBeenCalled();
    decision.resolve(true);
    await Promise.resolve();
    expect(starts()).toBe(0);
  });

  test("releases the listener when approval throws", async () => {
    const { target, starts } = makeTarget();
    const tool = createFunctionTool({
      id: "orders.lookup-tool",
      target,
      description: "Look up an order",
      sideEffect: "read",
      approval: "always",
    });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(
      tool.invoke(
        { id: "one" },
        {
          signal: controller.signal,
          approval: () => {
            throw new Error("approval unavailable");
          },
        },
      ),
    ).rejects.toThrow("approval unavailable");
    expect(remove).toHaveBeenCalled();
    expect(starts()).toBe(0);
  });
});
