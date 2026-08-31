import { defineEventFunction } from "@relkit/app/events";

const auditUpdatedOrder = defineEventFunction({
  id: "orders.audit-updated",
  event: "orders.updated",
  handler: async (input, context) => {
    context.log.info("Order audit", { ...input, eventId: context.trigger.event.id });
  },
});

export default auditUpdatedOrder;
