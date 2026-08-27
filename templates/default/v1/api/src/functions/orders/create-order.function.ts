import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";
import orderCreated from "@app/events/order-created.event.js";
import priceOrder from "@app/functions/orders/price-order.function.js";

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
  dependencies: { events: { orderCreated } },
  handler: async (input, context) => {
    const { totalCents } = await priceOrder.invoke({ quantity: input.quantity });
    const order = { orderId: input.orderId, sku: input.sku, totalCents };
    await context.events.orderCreated.publish(order);
    return order;
  },
});

export default createOrder;
