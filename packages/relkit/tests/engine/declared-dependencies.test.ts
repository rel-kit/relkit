/** Checks that functions, events, channels and databases declared under `dependencies` reach the
 * handler as `ctx.<kind>.<name>` clients in the engine and in the standalone kernel.
 */
import { defineFunction } from "../../src/app/index.js";
import { defineEvent } from "../../src/events/index.js";
import { dispatchInvocation } from "../../src/invocation/index.js";
import { defineChannel } from "../../src/realtime/index.js";
import { z } from "../../src/schema/index.js";
import { describe, expect, test } from "vitest";
import { DependencyAccessError } from "../../src/engine/dependencies.js";
import { invokeFunction } from "../../src/engine/index.js";

const priceOrder = defineFunction({
  id: "orders.price-order",
  input: z.object({ quantity: z.number() }),
  output: z.object({ totalCents: z.number() }),
  handler: async ({ quantity }) => ({ totalCents: quantity * 100 }),
});
const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  input: z.object({ orderId: z.string() }),
});
const orderUpdates = defineChannel({
  id: "orders.updates",
  params: z.object({ orderId: z.string() }),
  events: { changed: z.object({ status: z.string() }) },
  client: { public: true },
});
const analytics = { ref: { kind: "service", id: "analytics" } } as const;

const createOrder = defineFunction({
  id: "orders.create-order",
  input: z.object({ orderId: z.string(), quantity: z.number() }),
  output: z.object({ totalCents: z.number(), rows: z.number() }),
  dependencies: {
    functions: { priceOrder },
    events: { orderCreated },
    channels: { orderUpdates },
    databases: { analytics },
  },
  handler: async ({ orderId, quantity }, ctx) => {
    const { totalCents } = await ctx.functions.priceOrder({ quantity });
    await ctx.events.orderCreated.publish({ orderId });
    await ctx.channels.orderUpdates.trigger({ orderId }, "changed", { status: "created" });
    const rows = (ctx.databases.analytics as { readonly rows: number }).rows;
    expect(() => (ctx.functions as Record<string, unknown>).refund).toThrow(DependencyAccessError);
    return { totalCents, rows };
  },
});

function fakes() {
  const published: unknown[] = [];
  const triggered: unknown[] = [];
  return {
    published,
    triggered,
    clients: {
      events: {
        "orders.created": {
          publish: async (payload: unknown) => {
            published.push(payload);
            return { accepted: true };
          },
        },
      },
      channels: {
        "orders.updates": {
          trigger: async (...args: readonly unknown[]) => {
            triggered.push(args);
            return { accepted: true };
          },
        },
      },
      databases: { analytics: { rows: 3 } },
    },
  };
}

describe("declared call dependencies", () => {
  test("the engine calls declared functions and records each declared edge", async () => {
    const { clients, published, triggered } = fakes();
    const declared: unknown[] = [];
    const observed: unknown[] = [];
    const result = await invokeFunction(
      createOrder as never,
      { orderId: "o1", quantity: 2 },
      {
        clients,
        hooks: {
          onDeclaredEdge: (edge) => void declared.push(edge),
          onObservedEdge: (edge) => void observed.push(edge),
        },
      },
    );

    expect(result).toEqual({ totalCents: 200, rows: 3 });
    expect(published).toEqual([{ orderId: "o1" }]);
    expect(triggered).toEqual([[{ orderId: "o1" }, "changed", { status: "created" }]]);
    expect(declared).toEqual(
      expect.arrayContaining([
        { kind: "calls-function", from: "orders.create-order", to: "orders.price-order" },
        { kind: "publishes-event", from: "orders.create-order", to: "orders.created" },
        { kind: "triggers-channel", from: "orders.create-order", to: "orders.updates" },
        { kind: "uses-database", from: "orders.create-order", to: "analytics" },
      ]),
    );
    expect(observed).toEqual(
      expect.arrayContaining([
        {
          relationship: "calls-function",
          from: "orders.create-order",
          to: "orders.price-order",
        },
      ]),
    );
  });

  test("the standalone kernel runs declared functions without a running application", async () => {
    const result = await dispatchInvocation({
      target: defineFunction({
        id: "orders.quote",
        input: z.object({ quantity: z.number() }),
        output: z.object({ totalCents: z.number() }),
        dependencies: { functions: { priceOrder } },
        handler: async ({ quantity }, ctx) => ctx.functions.priceOrder({ quantity }),
      }) as never,
      input: { quantity: 3 },
    });
    expect(result).toEqual({ totalCents: 300 });
  });

  test("declaring an event-only function is rejected", () => {
    const eventOnly = { ...priceOrder, invocationMode: "event-only" };
    expect(() =>
      defineFunction({
        id: "orders.bad",
        input: z.object({}),
        output: z.object({}),
        dependencies: { functions: { eventOnly } } as never,
        handler: async () => ({}),
      }),
    ).toThrow("is event-only and cannot be called");
  });
});
