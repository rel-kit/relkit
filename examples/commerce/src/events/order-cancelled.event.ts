import { defineEvent } from "@relkit/app";
import { orderCancelledPayload } from "../shared/schemas.js";

const orderCancelled = defineEvent({
  id: "orders.cancelled",
  version: 1,
  payload: orderCancelledPayload,
  title: "Order cancelled",
});

export default orderCancelled;
