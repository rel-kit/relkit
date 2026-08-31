import { defineEvent } from "@relkit/app/events";
import { orderCreatedPayload } from "@app/platform/schemas.js";

const orderCreated = defineEvent({
  // Stable IDs and versions let publishers and listeners evolve deliberately.
  id: "orders.created",
  version: 1,
  // Every published payload is checked against this schema.
  input: orderCreatedPayload,
  // Inspector and observability surfaces redact this field.
  sensitiveFields: ["customerEmail"],
  title: "Order created",
});

export default orderCreated;
