import { defineEvent } from "@relkit/app/events";
import { orderUpdatedPayload } from "@app/shared/schemas.js";

const orderUpdated = defineEvent({
  id: "orders.updated",
  version: 1,
  payload: orderUpdatedPayload,
  title: "Order updated",
});

export default orderUpdated;
