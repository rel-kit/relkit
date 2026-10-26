/** Prices validated order input and persists its selected fields through the tutorial's native database context. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import priceOrder from "@app/services/orders/functions/price-order.function.js";
const order = z.object({
  orderId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});
export default defineFunction({
  input: order,
  output: z.object({
    orderId: z.string(),
    sku: z.string(),
    quantity: z.number().int().positive(),
    totalCents: z.number().int().nonnegative(),
  }),
  handler: async (input, context) => {
    const { totalCents } = await priceOrder.invoke({ quantity: input.quantity });
    const saved = await context.database.orders.insert({
      data: { ...input, totalCents, ownerId: null },
    });
    return {
      orderId: saved.orderId,
      sku: saved.sku,
      quantity: saved.quantity,
      totalCents: saved.totalCents,
    };
  },
});
