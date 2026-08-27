import { describe, expect, test } from "bun:test";
import { z } from "@relkit/schema";
import {
  createEventClient,
  EventPayloadValidationError,
  type EventOperationContext,
  type EventProvider,
} from "./src/client.ts";

const payload = z.object({ orderId: z.string(), totalCents: z.number() });

describe("event Promise client", () => {
  test("validates and returns the correlated versioned envelope", async () => {
    let context!: EventOperationContext;
    const provider: EventProvider = {
      publish: async (value, options, current) => {
        expect(value).toEqual({ orderId: "order-1", totalCents: 100 });
        expect(options).toEqual({ key: "order-1", attributes: { source: "checkout" } });
        context = current;
        return { instanceId: "event-1", accepted: true };
      },
    };
    const client = createEventClient({
      ownerId: "orders.create",
      eventId: "orders.created",
      version: 1,
      payloadSchema: payload,
      source: provider,
      correlationId: () => "request-1",
      causationInvocationId: () => "invocation-1",
      traceId: () => "trace-1",
      now: () => new Date(1_000),
    });

    const result = await client.publish(
      { orderId: "order-1", totalCents: 100 },
      { key: "order-1", attributes: { source: "checkout" } },
    );

    expect(result).toEqual({
      instanceId: "event-1",
      accepted: true,
      eventId: "orders.created",
      version: 1,
      payload: { orderId: "order-1", totalCents: 100 },
      occurredAt: new Date(1_000).toISOString(),
      publishedAt: new Date(1_000).toISOString(),
      key: "order-1",
      correlationId: "request-1",
      causationInvocationId: "invocation-1",
      traceId: "trace-1",
      attributes: { source: "checkout" },
    });
    const version: 1 = result.version;
    expect(version).toBe(1);
    expect(context).toMatchObject({
      operation: "publish",
      eventId: "orders.created",
      version: 1,
      correlationId: "request-1",
      causationInvocationId: "invocation-1",
      traceId: "trace-1",
    });
  });

  test("rejects invalid payload before provider acceptance", async () => {
    let calls = 0;
    const client = createEventClient({
      ownerId: "orders.create",
      eventId: "orders.created",
      version: 1,
      payloadSchema: payload,
      source: {
        publish: async () => {
          calls += 1;
          return { instanceId: "never", accepted: true };
        },
      },
    });

    await expect(
      client.publish({ orderId: "order-1", totalCents: "bad" } as never),
    ).rejects.toBeInstanceOf(EventPayloadValidationError);
    expect(calls).toBe(0);
  });
});
