import { defineEventFunction } from "@relkit/app/events";

const projectCancelledOrder = defineEventFunction({
  id: "orders.project-cancelled",
  event: "orders.cancelled",
  handler: async (input, context) => {
    context.log.info("Order cancelled", { orderId: input.orderId });
  },
});

export default projectCancelledOrder;
