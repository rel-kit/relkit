import { defineEvent } from "@relkit/app";
import { eventPayload } from "../../platform/schemas.js";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  input: eventPayload,
});

export default orderCreated;
