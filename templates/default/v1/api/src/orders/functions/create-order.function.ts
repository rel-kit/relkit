import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import priceOrder from "@app/orders/functions/price-order.function.js";

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

  handler: async (input) => {
    const { totalCents } = await priceOrder.invoke({ quantity: input.quantity });
    const order = {
      orderId: input.orderId,
      sku: input.sku,
      totalCents,
    };

    return order;
  },
});

export default createOrder;
