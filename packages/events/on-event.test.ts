import { describe, expect, test } from "bun:test";
import { validate, z } from "@zsys/schema";
import { createEventListenerTarget, defineEvent, events, onEvent } from "./src/index.ts";

const contract = defineEvent({
  id: "orders.created",
  version: 1,
  payload: z.object({ orderId: z.string().transform((value) => value.toUpperCase()) }),
});

const envelope = {
  instanceId: "event-1",
  eventId: "orders.created",
  version: 1,
  payload: { orderId: "order-1" },
  occurredAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z",
  traceId: "trace-1",
  correlationId: "correlation-1",
  attributes: { source: "test" },
} as const;

describe("onEvent", () => {
  test("defaults to durable delivery and validates payloads through the function engine", async () => {
    const seen: unknown[] = [];
    const listener = onEvent(
      "orders.created" as never,
      async (payload, context) => {
        seen.push(payload, context.event);
        return payload;
      },
      { id: "orders.receipt" },
    );
    const target = createEventListenerTarget(
      listener,
      [contract],
      "zsys.event.orders.receipt.handler",
    );

    const validated = await validate(target.input, envelope);
    expect(validated).toMatchObject({ value: { payload: { orderId: "ORDER-1" } } });
    if (!("value" in validated)) throw new Error("Expected the listener envelope to validate");
    await expect(target.handler(validated.value, undefined, {} as never)).resolves.toEqual({
      orderId: "ORDER-1",
    });
    expect(listener.delivery).toBe("durable");
    expect(seen).toEqual([
      { orderId: "ORDER-1" },
      expect.objectContaining({
        eventId: "orders.created",
        version: 1,
        instanceId: "event-1",
        correlationId: "correlation-1",
      }),
    ]);
    await expect(
      validate(target.input, { ...envelope, payload: { orderId: 42 } }),
    ).resolves.toHaveProperty("issues");
  });

  test("keeps unrestricted listeners explicit and rejects the legacy target shape", async () => {
    const listener = onEvent(
      events.all({ payload: "unknown", purpose: "telemetry" }),
      async (value) => value,
      { id: "telemetry.events", delivery: "ephemeral" },
    );
    const target = createEventListenerTarget(listener, [], "zsys.event.telemetry.events.handler");
    await expect(
      validate(target.input, { ...envelope, eventId: "third-party.event" }),
    ).resolves.toMatchObject({ value: { eventId: "third-party.event" } });
    expect(() => onEvent("orders.created" as never, { target } as never)).toThrow("callback");
  });
});
