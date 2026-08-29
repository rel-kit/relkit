import { defineFunction } from "@relkit/app/functions";
import orderCreated from "@app/orders/events/order-created.event.js";
import prices from "@app/orders/cache/prices.cache.js";
import { receiptObjectName } from "@app/platform/receipt-object.js";
import { createOrderOutput, orderInput } from "@app/platform/schemas.js";

const createOrder = defineFunction({
  // RELKIT validates these schemas before the handler runs.
  input: orderInput,
  output: createOrderOutput,
  dependencies: {
    cache: { prices },
    events: { orderCreated },
  },
  timeoutMs: 10_000,
  concurrency: 100,
  handler: async (input, context) => {
    // Dependencies are accessed through the checked execution context.
    const unitPrice = await context.cache.prices.getOrSet({ sku: input.sku }, async () => 1_000);
    const totalCents = unitPrice * input.quantity;
    await context.events.orderCreated.publish({ ...input, totalCents });
    return {
      orderId: input.orderId,
      receiptKey: receiptObjectName(input.orderId),
      totalCents,
    };
  },
});

export default createOrder;
