import { defineEvent } from "@relkit/app/events";
import { orderUpdatedPayload } from "@app/platform/schemas.js";

const orderUpdated = defineEvent({
  id: "orders.updated",
  version: 1,
  input: orderUpdatedPayload,
  title: "Order updated",
});

export default orderUpdated;
