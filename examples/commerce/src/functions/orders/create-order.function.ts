import { defineFunction } from "@relkit/app";
import orderCreated from "@app/events/order-created.event.js";
import sendReceiptJob from "@app/jobs/send-receipt.job.js";
import prices from "@app/cache/prices.cache.js";
import { receiptObjectName } from "@app/shared/receipt-object.js";
import { createOrderOutput, orderInput } from "@app/shared/schemas.js";

const createOrder = defineFunction({
  // RELKIT validates these schemas before the handler runs.
  input: orderInput,
  output: createOrderOutput,
  dependencies: {
    cache: { prices },
    events: { orderCreated },
    jobs: { sendReceiptJob },
  },
  timeoutMs: 10_000,
  concurrency: 100,
  handler: async (input, context) => {
    // Dependencies are accessed through the checked execution context.
    const unitPrice = await context.cache.prices.getOrSet({ sku: input.sku }, async () => 1_000);
    const totalCents = unitPrice * input.quantity;
    await context.events.orderCreated.publish({ ...input, totalCents });
    await context.jobs.sendReceiptJob.enqueue({
      orderId: input.orderId,
      receiptKey: receiptObjectName(input.orderId),
    });
    return {
      orderId: input.orderId,
      receiptKey: receiptObjectName(input.orderId),
      totalCents,
    };
  },
});

export default createOrder;
