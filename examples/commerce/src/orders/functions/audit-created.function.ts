import { defineEventFunction } from "@relkit/app/events";

const orderAudit = defineEventFunction({
  id: "orders.audit-created",
  event: "orders.created",
  handler: async (input, context) => {
    context.log.info("Order audit", { ...input, eventId: context.trigger.event.id });
  },
});

export default orderAudit;
