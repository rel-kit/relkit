import { describe, expect, test } from "bun:test";
import { z } from "../../packages/schema/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { invoke, type InvocationTarget } from "../../packages/engine/src/invoke.ts";
import {
  bindFunctionEvents,
  defineEvent,
  defineEventFunction,
} from "../../packages/events/src/index.ts";

const event = defineEvent({
  id: "order_created",
  input: z.object({ orderId: z.string().transform((value) => value.toUpperCase()) }),
});

describe("event functions", () => {
  test("keeps contracts and consumers non-invocable with normalized defaults", () => {
    const consumer = defineEventFunction({
      id: "send_receipt",
      event: "order_created" as never,
      handler: async () => {},
    });
    expect(event.version).toBe(1);
    expect(event).not.toHaveProperty("invoke");
    expect(event).not.toHaveProperty("publish");
    expect(consumer).toMatchObject({
      kind: "function",
      invocationMode: "event-only",
      delivery: "durable",
      profile: "default",
      retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
    });
    expect(consumer).not.toHaveProperty("invoke");
    expect(consumer).not.toHaveProperty("asTool");
  });

  test("validates parsed input for delivery and replay and rejects non-event sources", async () => {
    const seen: unknown[] = [];
    const consumer = defineEventFunction({
      id: "send_receipt",
      event: "order_created" as never,
      handler: async (input, context) => {
        seen.push(input, context.trigger);
      },
    });
    const target = bindFunctionEvents(consumer, event, []) as InvocationTarget;
    for (const source of ["event-delivery", "event-replay"] as const) {
      await invoke({ target, input: { orderId: "abc" }, source, trigger: { kind: "event" } });
    }
    expect(seen).toEqual([
      { orderId: "ABC" },
      { kind: "event" },
      { orderId: "ABC" },
      { kind: "event" },
    ]);
    for (const source of ["direct", "http", "job", "tool", "agent"] as const) {
      await expect(invoke({ target, input: { orderId: "abc" }, source })).rejects.toThrow(
        "Event-only",
      );
    }
    await expect(
      invoke({ target, input: { orderId: 1 }, source: "event-delivery" }),
    ).rejects.toHaveProperty("code", "RELKIT_INPUT_VALIDATION");
  });

  test("binds only declared publications and validates before provider submission", async () => {
    const published: unknown[] = [];
    const publisher = defineFunction({
      id: "create_order",
      input: z.unknown(),
      output: z.void(),
      publishes: ["order_created" as never],
      handler: async (input, context) => {
        expect(() => Reflect.get(context.events, "other_event")).toThrow("not declared");
        await (context.events as any).order_created.publish(input);
      },
    });
    const target = bindFunctionEvents(publisher, undefined, [event]) as InvocationTarget;
    const clients = {
      events: {
        order_created: {
          publish: async (payload: unknown) => {
            published.push(payload);
            return { instanceId: "event-1", accepted: true };
          },
        },
      },
    };
    await invoke({ target, input: { orderId: "abc" }, clients });
    expect(published).toEqual([{ orderId: "ABC" }]);
    await expect(invoke({ target, input: { orderId: 1 }, clients })).rejects.toBeDefined();
    expect(published).toHaveLength(1);
  });

  test("consumers publish follow-up events and can explicitly republish their consumed event", async () => {
    const receipt = defineEvent({
      id: "receipt_requested",
      input: z.object({ orderId: z.string() }),
    });
    const published: string[] = [];
    const consumer = defineEventFunction({
      id: "followup",
      event: "order_created" as never,
      publishes: ["order_created" as never, "receipt_requested" as never],
      handler: async (input, context) => {
        await (context.events as any).order_created.publish(input);
        await (context.events as any).receipt_requested.publish(input);
      },
    });
    const clients = {
      events: Object.fromEntries(
        [event, receipt].map((contract) => [
          contract.id,
          {
            publish: async () => {
              published.push(contract.id);
              return { accepted: true, instanceId: contract.id };
            },
          },
        ]),
      ),
    };
    await invoke({
      target: bindFunctionEvents(consumer, event, [event, receipt]) as unknown as InvocationTarget,
      source: "event-delivery",
      input: { orderId: "a" },
      clients,
    });
    expect(published).toEqual(["order_created", "receipt_requested"]);
    const empty = defineEventFunction({
      id: "no_publications",
      event: "order_created" as never,
      handler: async (_, context) => {
        expect(Object.keys(context.events)).toEqual([]);
        expect(() => Reflect.get(context.events, "order_created")).toThrow("not declared");
      },
    });
    await invoke({
      target: bindFunctionEvents(empty, event, []) as unknown as InvocationTarget,
      source: "event-delivery",
      input: { orderId: "a" },
      clients,
    });
  });
});
