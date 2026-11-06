import { defineFunction } from "relkit/functions";
import { s } from "relkit/schema";
import priceOrder from "./price-order.function.js";
import orderUpdates from "../channels/order-updates.channel.js";
import orderPlaced from "../events/order-placed.event.js";

const placeOrder = defineFunction({
  input: s.object({ orderId: s.string(), quantity: s.number().int().positive() }),
  output: s.object({ orderId: s.string(), totalCents: s.number() }),
  dependencies: { events: { orderPlaced }, functions: { priceOrder }, channels: { orderUpdates } },
  handler: async ({ orderId, quantity }, context) => {
    const { totalCents } = await context.functions.priceOrder({ quantity });
    await context.events.orderPlaced.publish({ orderId });
    await context.channels.orderUpdates.trigger({ orderId }, "placed", { totalCents });
    return { orderId, totalCents };
  },
});

export default placeOrder;
