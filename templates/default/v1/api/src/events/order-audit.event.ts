import { onEvent } from "@relkit/app";

const orderAudit = onEvent(
  "orders.created",
  async (payload, context) => {
    context.log.info("order.audit.recorded", {
      orderId: payload.orderId,
      sku: payload.sku,
      totalCents: payload.totalCents,
    });
  },
  { id: "orders.audit" },
);

export default orderAudit;
