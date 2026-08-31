import { defineEventFunction } from "@relkit/app/events";

const telemetry = defineEventFunction({
  id: "telemetry.order-created",
  event: "orders.created",
  delivery: "ephemeral",
  tags: ["telemetry"],
  handler: async (_, context) => {
    context.log.info("Event received", context.trigger.event);
  },
});

export default telemetry;
