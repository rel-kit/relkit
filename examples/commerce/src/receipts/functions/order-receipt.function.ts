import { defineEventFunction } from "@relkit/app/events";
import orders from "@app/orders/service.js";
import sendReceiptJob from "@app/receipts/jobs/send-receipt.job.js";
import { receiptObjectName } from "@app/platform/receipt-object.js";

const orderReceipt = defineEventFunction({
  id: "receipts.on-order-created",
  event: "orders.created",
  profile: "default",
  dependencies: { jobs: { sendReceiptJob } },
  retry: { maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 10_000, multiplier: 2, jitter: "none" },
  concurrency: 4,
  handler: async (payload, context) => {
    const order = await orders.getOrder.invoke({ orderId: payload.orderId });
    await context.jobs.sendReceiptJob.enqueue({
      orderId: payload.orderId,
      receiptKey: receiptObjectName(order.orderId),
    });
  },
});

export default orderReceipt;
