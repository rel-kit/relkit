import { defineEventFunction } from "@relkit/app/events";

const auditCancelledOrder = defineEventFunction({
  id: "orders.audit-cancelled",
  event: "orders.cancelled",
  handler: async (input, context) => {
    context.log.info("Order audit", { ...input, eventId: context.trigger.event.id });
  },
});

export default auditCancelledOrder;
