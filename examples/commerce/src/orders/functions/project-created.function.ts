import { defineEventFunction } from "@relkit/app/events";

const orderProjector = defineEventFunction({
  id: "orders.project-created",
  event: "orders.created",
  handler: async (input, context) => {
    context.log.info("Order created", { orderId: input.orderId });
  },
});

export default orderProjector;
