import { defineFunction } from "@zsys/app";
import orderCreated from "../../events/order-created.event.js";
import sendReceiptJob from "../../jobs/send-receipt.job.js";
import prices from "../../cache/prices.cache.js";
import { receiptObjectName } from "../../shared/receipt-object.js";
import { createOrderOutput, orderInput } from "../../shared/schemas.js";

const createOrder = defineFunction({
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
