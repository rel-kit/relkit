import { defineEvent } from "@relkit/app";
import { orderCreatedPayload } from "@app/shared/schemas.js";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  payload: orderCreatedPayload,
  sensitiveFields: ["customerEmail"],
  title: "Order created",
});

export default orderCreated;
