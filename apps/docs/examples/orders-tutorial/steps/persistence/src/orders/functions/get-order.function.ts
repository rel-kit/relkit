import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineFunction({
  input: z.object({ orderId: z.string().min(1) }),
  output: z.object({
    found: z.boolean(),
    order: z.object({ orderId: z.string(), sku: z.string(), quantity: z.number(), totalCents: z.number() }).optional(),
  }),
  handler: async ({ orderId }, context) => {
    const row = await context.database.orders.findOne({ where: { orderId } });
    return row === null ? { found: false } : {
      found: true,
      order: { orderId: row.orderId, sku: row.sku, quantity: row.quantity, totalCents: row.totalCents },
    };
  },
});
