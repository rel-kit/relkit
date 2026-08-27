import { defineEvent } from "@relkit/app";
import { eventPayload } from "../shared/schemas.js";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  payload: eventPayload,
});

export default orderCreated;
