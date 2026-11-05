import { defineEvent } from "relkit/events";
import { s } from "relkit/schema";

const orderPlaced = defineEvent({
  id: "orders.placed",
  version: 1,
  input: s.object({ orderId: s.string() }),
});

export default orderPlaced;
