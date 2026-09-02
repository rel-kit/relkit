import { defineEventFunction } from "@relkit/app/events";

const orderConfirmation = defineEventFunction({
  id: "orders.confirmation",
  event: "orders.created",
  handler: async (order, context) => {
    context.log.info("order.confirmation.requested", { orderId: order.orderId });
  },
});

export default orderConfirmation;
