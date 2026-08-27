import { describe, expect, test } from "bun:test";
import { z } from "@relkit/schema";
import { createTestEvent } from "./src/index.ts";

const target = {
  id: "orders.receipt",
  input: z.unknown(),
  output: z.object({ handled: z.boolean() }),
  handler: async () => ({ handled: true }),
};

const retry = {
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none" as const,
};

describe("testing event fake", () => {
  test("publishes deterministic envelopes and drains durable fan-out", async () => {
    let received: unknown;
    const event = await createTestEvent({
      eventId: "orders.created",
      version: 1,
      payloadSchema: z.object({ orderId: z.string() }),
      target: {
        ...target,
        handler: async (input) => {
          received = input;
          return { handled: true };
        },
      },
      startTimeMs: 100,
      retry,
    });
    try {
      const published = await event.publish({ orderId: "order-1" });
      expect(published).toMatchObject({
        instanceId: "test-event-orders.created-1",
        eventId: "orders.created",
        version: 1,
        occurredAt: new Date(100).toISOString(),
        publishedAt: new Date(100).toISOString(),
        traceId: "test-trace-1",
      });
      expect(event.pending("orders.created.trigger")).toBe(1);
      expect(event.envelopes).toHaveLength(1);
      await expect(event.drain()).resolves.toMatchObject([{ state: "completed", attempt: 1 }]);
      expect(received).toMatchObject({
        instanceId: published.instanceId,
        payload: { orderId: "order-1" },
      });
      expect(event.pending()).toBe(0);
      expect(event.completed("orders.created.trigger")).toBe(1);
      expect(event.attempts).toHaveLength(1);
      expect(event.deliveries[0]).toMatchObject({ state: "completed", attempt: 1 });
    } finally {
      await event.close();
    }
  });

  test("keeps named publication and acknowledgement failures observable", async () => {
    const event = await createTestEvent({
      eventId: "orders.created",
      version: 1,
      target,
      startTimeMs: 0,
      leaseDurationMs: 10,
      retry,
    });
    try {
      event.failures.once("event.after-persist-before-fanout");
      await expect(event.publish({ orderId: "persist" })).rejects.toThrow(
        "event.after-persist-before-fanout",
      );
      expect(event.envelopes).toHaveLength(1);
      await expect(event.runNext()).resolves.toMatchObject({ state: "completed" });

      event.failures.once("event.after-fan-out");
      await expect(event.publish({ orderId: "fanout" })).rejects.toThrow("event.after-fan-out");
      expect(event.pending()).toBe(1);
      await expect(event.runNext()).resolves.toMatchObject({ state: "completed" });

      event.failures.once("event.after-handler-success-before-ack");
      await event.publish({ orderId: "ack-gap" });
      await expect(event.runNext()).rejects.toThrow("event.after-handler-success-before-ack");
      await event.clock.advance(10);
      await event.restart();
      await expect(event.runNext()).resolves.toMatchObject({
        state: "completed",
        duplicate: true,
        attempt: 2,
      });

      event.failures.once("event.after-ack");
      await event.publish({ orderId: "after-ack" });
      await expect(event.runNext()).rejects.toThrow("event.after-ack");
      expect(event.completed()).toBe(4);
    } finally {
      await event.close();
    }
  });
});
