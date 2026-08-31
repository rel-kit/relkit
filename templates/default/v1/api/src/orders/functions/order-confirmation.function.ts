import { defineEventFunction } from "@relkit/app/events";

const orderConfirmation = defineEventFunction({
  id: "orders.confirmation",
  event: "orders.created",

  handler: async (payload, context) => {
    // Replace this log with your email-sending code.
    context.log.info("order.confirmation.requested", {
      orderId: payload.orderId,
    });
  },
});

export default orderConfirmation;
