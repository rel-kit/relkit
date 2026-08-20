import { defineEvent } from "@zsys/app";
import { orderUpdatedPayload } from "../shared/schemas.js";

const orderUpdated = defineEvent({
  id: "orders.updated",
  version: 1,
  payload: orderUpdatedPayload,
  title: "Order updated",
});

export default orderUpdated;
