import { describe, expect, expectTypeOf, test } from "vitest";
import { bindDescriptorIdentity, DispatcherBoundary } from "@relkit/invocation";
import { z } from "@relkit/schema";
import { Cause, Effect, Exit, Layer } from "effect";
import { defineFunction, isFunctionGraphNode, streamOf } from "../src/index.js";
import {
  createFunctionGraphNodeEffect,
  invokeFunctionGraphNodeEffect,
} from "../src/function-graph-node.js";
import { FunctionOperationError } from "../src/function-observability.js";

describe("function graph-node views", () => {
  test("preserves function contracts and invokes the original function once", async () => {
    let calls = 0;
    const target = defineFunction({
      input: z.object({ orderId: z.string() }),
      output: z.object({ summary: z.string() }),
      title: "Lookup order",
      description: "Loads an order summary",
      tags: ["orders"],
      handler: ({ orderId }) => {
        calls += 1;
        return { summary: orderId };
      },
    });
    bindDescriptorIdentity(target, "orders.lookup");

    const node = target.asGraphNode({ id: "lookup" });
    const defaultNode = target.asGraphNode();
    expectTypeOf(node.id).toEqualTypeOf<"lookup">();

    expect(node).toMatchObject({
      kind: "function-graph-node",
      id: "lookup",
      target: { kind: "function", id: "orders.lookup" },
      input: target.input,
      output: target.output,
      title: "Lookup order",
      description: "Loads an order summary",
      tags: ["orders"],
    });
    expect(defaultNode.id).toBe("orders.lookup");
    expect(isFunctionGraphNode(node)).toBe(true);
    expect("handler" in node).toBe(false);
    expect(Object.isFrozen(node)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(node, "invoke")).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    expect(Object.getOwnPropertyDescriptor(target, "asGraphNode")).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    await expect(node.invoke({ orderId: "order-1" })).resolves.toEqual({
      summary: "order-1",
    });
    expect(calls).toBe(1);
    await expect(
      Effect.runPromise(invokeFunctionGraphNodeEffect(target, { orderId: "order-2" })),
    ).resolves.toEqual({ summary: "order-2" });
    expect(calls).toBe(2);
  });

  test("rejects invalid options and streaming function views", () => {
    const stream = defineFunction({
      id: "orders.stream",
      input: z.object({ orderId: z.string() }),
      output: streamOf(z.object({ token: z.string() })),
      handler: async function* () {
        yield { token: "ready" };
      },
    });
    expect(() => (stream.asGraphNode as unknown as (options?: unknown) => unknown)()).toThrow(
      "Stream-output functions cannot be converted to graph nodes",
    );

    const target = defineFunction({
      id: "orders.lookup",
      input: z.object({ orderId: z.string() }),
      output: z.object({ summary: z.string() }),
      handler: ({ orderId }) => ({ summary: orderId }),
    });
    expectTypeOf(target.asGraphNode().id).toEqualTypeOf<"orders.lookup">();
    expect(() => (target.asGraphNode as (options?: unknown) => unknown)("lookup")).toThrow(
      "options must be an object",
    );
    expect(() => target.asGraphNode({ id: "not a valid id" })).toThrow("Invalid stable ID");
  });

  test("reports graph invocation dispatch failure through the tagged channel", async () => {
    const target = defineFunction({
      id: "orders.lookup",
      input: z.object({ orderId: z.string() }),
      output: z.object({ summary: z.string() }),
      handler: ({ orderId }) => ({ summary: orderId }),
    });
    const dispatcher = {
      dispatch: async () => {
        throw new Error("graph dispatch failed");
      },
    };
    const boundary = Layer.succeed(DispatcherBoundary, {
      current: () => dispatcher,
      fallback: () => dispatcher,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(invokeFunctionGraphNodeEffect(target, { orderId: "one" }), boundary),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.squash(exit.cause);
      expect(failure).toBeInstanceOf(FunctionOperationError);
      expect((failure as FunctionOperationError).cause).toEqual(new Error("graph dispatch failed"));
    }
  });
});

test("a graph view invokes with the dispatcher supplied at call time", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: () => ({ id: "handler" }),
  });
  const node = await Effect.runPromise(createFunctionGraphNodeEffect(target, target));
  const dispatcher = { dispatch: async () => ({ id: "layer" }) };
  const layer = Layer.succeed(DispatcherBoundary, {
    current: () => dispatcher,
    fallback: () => dispatcher,
  });
  await expect(
    Effect.runPromise(Effect.provide(node.invokeEffect({ id: "one" }), layer)),
  ).resolves.toEqual({ id: "layer" });
  await expect(node.invoke({ id: "one" })).resolves.toEqual({ id: "handler" });
});
