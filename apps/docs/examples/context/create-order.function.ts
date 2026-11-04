import { defineFunction } from "@relkit/app/functions";
import { z } from "zod";
import orderCreated from "../events/order-created.event.js";
import orderUpdates from "./order-updates.channel.js";
import priceOrder from "./price-order.function.js";
import prices from "./prices.cache.js";

const createOrder = defineFunction({
  input: z.object({
    orderId: z.string().min(1),
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
  }),
  output: z.object({
    orderId: z.string(),
    sku: z.string(),
    totalCents: z.number().int().nonnegative(),
  }),
  // Everything the handler calls, declared once. The graph draws an edge for each entry.
  dependencies: {
    functions: { priceOrder },
    cache: { prices },
    events: { orderCreated },
    channels: { orderUpdates },
  },
  handler: async (input, context) => {
    const unitCents = await context.cache.prices.getOrSet({ sku: input.sku }, async () => 1_000);
    const { totalCents } = await context.functions.priceOrder({
      unitCents,
      quantity: input.quantity,
    });
    const order = { orderId: input.orderId, sku: input.sku, totalCents };
    await context.events.orderCreated.publish(order);
    await context.channels.orderUpdates.trigger({ orderId: order.orderId }, "created", {
      orderId: order.orderId,
      totalCents,
    });
    return order;
  },
});

export default createOrder;
