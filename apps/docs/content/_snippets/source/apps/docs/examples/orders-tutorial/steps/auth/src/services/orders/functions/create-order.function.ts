/** Prices validated order input and persists it with the authenticated session user's ownership. */
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
    const session = await context.auth.getSession();
    if (session === null) throw new Error("Authentication required");
    const { totalCents } = await priceOrder.invoke({ quantity: input.quantity });
    const saved = await context.database.orders.insert({
      data: { ...input, totalCents, ownerId: session.user.id },
    });
    return {
      orderId: saved.orderId,
      sku: saved.sku,
      quantity: saved.quantity,
      totalCents: saved.totalCents,
    };
  },
});
