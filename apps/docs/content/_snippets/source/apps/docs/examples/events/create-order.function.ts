import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

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
  publishes: ["orders.created"],
  handler: async (input, context) => {
    const order = { orderId: input.orderId, sku: input.sku, totalCents: input.quantity * 100 };
    await context.events["orders.created"].publish(order);
    return order;
  },
});

export default createOrder;
