/** Announces a placed order; its payload is a Valibot schema. */
import { defineEvent } from "relkit/events";
import * as v from "valibot";

const orderPlaced = defineEvent({
  id: "orders.placed",
  version: 1,
  input: v.object({ orderId: v.string(), sku: v.string(), quantity: v.number() }),
});

declare global {
  namespace Relkit {
    interface EventRegistry {
      readonly "orders.placed": typeof orderPlaced;
    }
  }
}

export default orderPlaced;
