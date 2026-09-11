import { describe, expect, expectTypeOf, test } from "bun:test";
import { bindDescriptorIdentity } from "@relkit/invocation";
import { z } from "@relkit/schema";
import { defineFunction, isFunctionGraphNode, streamOf } from "./src/index.ts";

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
});
