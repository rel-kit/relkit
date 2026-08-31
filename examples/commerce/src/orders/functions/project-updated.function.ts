import { defineEventFunction } from "@relkit/app/events";

const projectUpdatedOrder = defineEventFunction({
  id: "orders.project-updated",
  event: "orders.updated",
  handler: async (input, context) => {
    context.log.info("Order updated", { orderId: input.orderId });
  },
});

export default projectUpdatedOrder;
