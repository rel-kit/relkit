/** Event contract published by the order function. */
import { defineEvent } from "relkit/events";
import { s } from "relkit/schema";

export default defineEvent({
  id: "orders.placed",
  version: 1,
  input: s.object({ orderId: s.string(), quantity: s.number().int() }),
  profile: "local",
});
