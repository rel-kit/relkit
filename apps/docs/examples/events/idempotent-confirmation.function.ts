import { defineEventFunction } from "@relkit/app/events";

const idempotentConfirmation = defineEventFunction({
  id: "orders.idempotent-confirmation",
  event: "orders.created",
  delivery: "durable",
  handler: async (order, context) => {
    // The instance ID is the same on every redelivery of this event, so it makes a stable key.
    const key = `confirmation:${context.trigger.event.instanceId}`;
    context.log.info("order.confirmation.sending", {
      orderId: order.orderId,
      attempt: context.trigger.delivery.attempt,
    });
    const response = await fetch("https://mail.example.com/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ orderId: order.orderId }),
      signal: context.signal,
    });
    if (!response.ok) throw new Error(`Confirmation failed with status ${response.status}`);
  },
});

export default idempotentConfirmation;
