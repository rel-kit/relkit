/** Places an order and publishes `orders.placed`; its input and output are Valibot schemas. */
import { defineFunction } from "@relkit/app/functions";
import * as v from "valibot";
import orderPlaced from "../events/order-placed.event.js";

export default defineFunction({
  id: "orders.place-order",
  input: v.object({
    sku: v.pipe(v.string(), v.minLength(1)),
    quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
    note: v.optional(v.string()),
  }),
  output: v.object({ orderId: v.string() }),
  dependencies: { events: { orderPlaced } },
  handler: async ({ sku, quantity }, context) => {
    const orderId = `order-${sku}-${quantity}`;
    await context.events.orderPlaced.publish({ orderId, sku, quantity });
    return { orderId };
  },
});
