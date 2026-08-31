import { defineEventFunction } from "@relkit/app/events";

const orderAudit = defineEventFunction({
  id: "orders.audit",
  event: "orders.created",
  handler: async (payload, context) => {
    context.log.info("order.audit.recorded", {
      orderId: payload.orderId,
      sku: payload.sku,
      totalCents: payload.totalCents,
    });
  },
});

export default orderAudit;
