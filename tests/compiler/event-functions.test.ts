import { expect, test } from "bun:test";
import { normalizeCompilation } from "../../packages/cli/src/compiler/index.ts";
import { defineEvent, defineEventFunction } from "relkit/events";
import { defineFunction } from "relkit/functions";
import { z } from "relkit/schema";

const event = defineEvent({ id: "order_created", input: z.object({ orderId: z.string() }) });
const consumer = defineEventFunction({
  id: "send_receipt",
  event: "order_created" as never,
  handler: async () => {},
});

test("lowers an authored event function to one exact-event trigger", () => {
  const result = normalizeCompilation({ descriptors: [event, consumer] });
  expect(result.diagnostics).toEqual([]);
  expect(result.graph?.nodes.filter((node) => node.kind === "function")).toEqual([
    expect.objectContaining({
      id: "send_receipt",
      invocationMode: "event-only",
      input: expect.objectContaining({ type: "object" }),
    }),
  ]);
  expect(result.graph?.nodes.filter((node) => node.kind === "trigger")).toEqual([
    expect.objectContaining({
      id: "relkit.event.send_receipt.trigger",
      targetFunctionId: "send_receipt",
      config: expect.objectContaining({ eventId: "order_created", eventVersion: 1 }),
    }),
  ]);
  const trigger = result.graph?.nodes.find((node) => node.kind === "trigger");
  expect(trigger?.config).not.toHaveProperty("concurrency");
  expect(trigger?.config).not.toHaveProperty("timeoutMs");
  expect(result.graph?.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "targets-function",
        from: "relkit.event.send_receipt.trigger",
        to: "send_receipt",
      }),
      expect.objectContaining({
        kind: "listens-to-event",
        from: "relkit.event.send_receipt.trigger",
        to: "order_created",
      }),
    ]),
  );
  expect(result.graph?.edges).toHaveLength(2);
});

test("preserves explicit event delivery limits in the graph", () => {
  const bounded = defineEventFunction({
    id: "bounded_receipt",
    event: "order_created" as never,
    concurrency: 4,
    timeoutMs: 30_000,
    handler: async () => {},
  });
  const result = normalizeCompilation({ descriptors: [event, bounded] });
  expect(result.diagnostics).toEqual([]);
  expect(result.graph?.nodes.find((node) => node.kind === "trigger")?.config).toMatchObject({
    concurrency: 4,
    timeoutMs: 30_000,
  });
});

test("derives publishes-event edges and node publishes from dependencies.events", () => {
  const publisher = defineFunction({
    id: "publisher",
    input: z.object({ orderId: z.string() }),
    output: z.void(),
    dependencies: { events: { orderCreated: event } },
    handler: async (input, context) => {
      await context.events.orderCreated.publish(input);
    },
  });
  const result = normalizeCompilation({ descriptors: [event, publisher] });
  expect(result.diagnostics).toEqual([]);
  expect(result.graph?.nodes.find((node) => node.id === "publisher")).toMatchObject({
    kind: "function",
    publishes: ["order_created"],
  });
  expect(result.graph?.edges.filter((edge) => edge.kind === "publishes-event")).toEqual([
    expect.objectContaining({ from: "publisher", to: "order_created" }),
  ]);
});

test("reserves generated trigger identities and rejects unknown consumer events", () => {
  const collision = defineFunction({
    id: "relkit.event.send_receipt.trigger",
    input: z.unknown(),
    output: z.void(),
    handler: () => {},
  });
  const result = normalizeCompilation({ descriptors: [consumer, collision] });
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "RELKIT_EVENT_TRIGGER_ID_COLLISION",
        message: expect.stringContaining("send_receipt"),
      }),
      expect.objectContaining({
        code: "RELKIT_EVENT_NAME_UNKNOWN",
        message: expect.stringContaining("order_created"),
      }),
    ]),
  );
});

test("rejects executable fields on forged event contracts", () => {
  const result = normalizeCompilation({
    descriptors: [{ ...event, handler: () => {}, output: z.void() }],
  });
  expect(
    result.diagnostics.filter((diagnostic) => diagnostic.code === "RELKIT_DESCRIPTOR_INVALID"),
  ).toHaveLength(2);
});
