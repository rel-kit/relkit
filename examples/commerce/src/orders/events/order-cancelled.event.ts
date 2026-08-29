import { defineEvent } from "@relkit/app/events";
import { orderCancelledPayload } from "@app/platform/schemas.js";

const orderCancelled = defineEvent({
  id: "orders.cancelled",
  version: 1,
  payload: orderCancelledPayload,
  title: "Order cancelled",
});

export default orderCancelled;
