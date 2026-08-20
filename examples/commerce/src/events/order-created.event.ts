import { defineEvent } from "@zsys/app";
import { orderCreatedPayload } from "../shared/schemas.js";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  payload: orderCreatedPayload,
  sensitiveFields: ["customerEmail"],
  title: "Order created",
});

export default orderCreated;
