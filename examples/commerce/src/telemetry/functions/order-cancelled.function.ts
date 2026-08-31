import { defineEventFunction } from "@relkit/app/events";

const cancelledTelemetry = defineEventFunction({
  id: "telemetry.order-cancelled",
  event: "orders.cancelled",
  delivery: "ephemeral",
  tags: ["telemetry"],
  handler: async (_, context) => {
    context.log.info("Event received", context.trigger.event);
  },
});

export default cancelledTelemetry;
