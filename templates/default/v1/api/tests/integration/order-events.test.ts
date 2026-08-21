import { expect, test } from "bun:test";
import { createEventListenerTarget, eventListenerFunctionId } from "@zsys/app";
import { createTestEvent, invokeFunction } from "@zsys/testing";
import orderCreated from "../../src/events/order-created.event.js";
import orderAudit from "../../src/events/order-audit.event.js";
import orderConfirmation from "../../src/events/order-confirmation.event.js";
import orders from "../../src/services/orders.service.js";

const retry = {
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none" as const,
};

test("order.created fans out deterministic independent deliveries", async () => {
  const confirmationTarget = createEventListenerTarget(
    orderConfirmation,
    [orderCreated],
    eventListenerFunctionId(orderConfirmation.id),
  );
  const auditTarget = createEventListenerTarget(
    orderAudit,
    [orderCreated],
    eventListenerFunctionId(orderAudit.id),
  );
  const failingAuditTarget = {
    ...auditTarget,
    handler: async (...args: Parameters<typeof auditTarget.handler>) => {
      await auditTarget.handler(...args);
      throw new Error("audit listener test failure");
    },
  };
  const event = await createTestEvent({
    event: orderCreated,
    triggers: [
      { id: orderConfirmation.id, target: confirmationTarget, retry },
      { id: orderAudit.id, target: failingAuditTarget, retry },
    ],
  });

  try {
    await expect(
      invokeFunction(
        orders.createOrder,
        { orderId: "order-1", sku: "book", quantity: 3 },
        { clients: { events: { orderCreated: event.provider } } },
      ),
    ).resolves.toEqual({ orderId: "order-1", sku: "book", totalCents: 300 });

    await expect(event.drain()).resolves.toMatchObject([
      {
        triggerId: "orders.audit",
        status: "failed",
        state: "dead-lettered",
        attempt: 1,
      },
      {
        triggerId: "orders.confirmation",
        status: "completed",
        state: "completed",
        attempt: 1,
      },
    ]);
    expect(event.completed("orders.confirmation")).toBe(1);
    expect(event.completed("orders.audit")).toBe(0);
  } finally {
    await event.close();
  }
});
