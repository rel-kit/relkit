import { onEvent } from "@relkit/app/events";
import orders from "@app/services/orders.service.js";
import sendReceiptJob from "@app/jobs/send-receipt.job.js";
import { receiptObjectName } from "@app/shared/receipt-object.js";

const orderReceipt = onEvent(
  "orders.created",
  async (payload, context) => {
    const order = await orders.getOrder.invoke({ orderId: payload.orderId });
    await context.jobs.sendReceiptJob.enqueue({
      orderId: payload.orderId,
      receiptKey: receiptObjectName(order.orderId),
    });
  },
  {
    id: "receipts.on-order-created",
    profile: "default",
    dependencies: { jobs: { sendReceiptJob } },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      multiplier: 2,
      jitter: "none",
    },
    concurrency: 4,
  },
);

export default orderReceipt;
