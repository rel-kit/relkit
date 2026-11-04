/** Validates order input, calls the declared pricing function, and returns the calculated order. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "zod";
import priceOrder from "@app/services/orders/functions/price-order.function.js";

const orderInput = z.object({
  orderId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

const orderOutput = z.object({
  orderId: z.string(),
  sku: z.string(),
  totalCents: z.number().int().nonnegative(),
});

const createOrder = defineFunction({
  input: orderInput,
  output: orderOutput,
  dependencies: { functions: { priceOrder } },
  handler: async (input, context) => {
    const { totalCents } = await context.functions.priceOrder({ quantity: input.quantity });
    const order = {
      orderId: input.orderId,
      sku: input.sku,
      totalCents,
    };

    return order;
  },
});

export default createOrder;
