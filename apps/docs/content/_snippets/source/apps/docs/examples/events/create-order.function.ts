import { defineFunction } from "relkit/functions";
import { z } from "zod";
import orderCreated from "../events/order-created.event.js";

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
  dependencies: { events: { orderCreated } },
  handler: async (input, context) => {
    const order = { orderId: input.orderId, sku: input.sku, totalCents: input.quantity * 100 };
    await context.events.orderCreated.publish(order);
    return order;
  },
});

export default createOrder;
