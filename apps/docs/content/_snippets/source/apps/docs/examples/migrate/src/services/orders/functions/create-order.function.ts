/** Validates a new order and returns its calculated total. */
import { defineFunction } from "relkit/functions";
import { z } from "zod";

const createOrder = defineFunction({
  input: z.object({
    orderId: z.string().min(1),
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
  }),
  output: z.object({ orderId: z.string(), sku: z.string(), totalCents: z.number().int() }),
  handler: async ({ orderId, sku, quantity }, context) => {
    context.log.info("order created", { orderId });
    return { orderId, sku, totalCents: quantity * 100 };
  },
});

export default createOrder;
