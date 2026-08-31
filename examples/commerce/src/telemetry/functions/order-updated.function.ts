import { defineEventFunction } from "@relkit/app/events";

const updatedTelemetry = defineEventFunction({
  id: "telemetry.order-updated",
  event: "orders.updated",
  delivery: "ephemeral",
  tags: ["telemetry"],
  handler: async (_, context) => {
    context.log.info("Event received", context.trigger.event);
  },
});

export default updatedTelemetry;
