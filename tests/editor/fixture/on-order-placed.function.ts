/** Reaction to the order event. */
import { defineEventFunction } from "relkit/events";

export default defineEventFunction({
  id: "orders.on-placed",
  event: "orders.placed",
  handler: async (input, context) => {
    context.log.info("order placed", { orderId: input.orderId, event: context.trigger.event.id });
  },
});
