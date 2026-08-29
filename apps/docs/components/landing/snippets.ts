export const functionSnippet = `import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import orderCreated from "@app/orders/events/order-created.event.js";
import sendReceiptJob from "@app/receipts/jobs/send-receipt.job.js";
import { orderInput } from "@app/platform/schemas.js";

const createOrder = defineFunction({
  input: orderInput,
  output: z.object({ success: z.boolean() }),
  dependencies: { events: { orderCreated }, jobs: { sendReceiptJob } },
  handler: async (input, context) => {
    const payload = { ...input, totalCents: 1_000, receiptKey: \`receipts/\${input.orderId}.json\` };
    await context.events.orderCreated.publish(payload);
    await context.jobs.sendReceiptJob.enqueue(payload);
    return { success: true };
  },
});`;

export const jobSnippet = `import { defineJob } from "@relkit/app/jobs";
import sendReceipt from "@app/receipts/functions/send-receipt.function.js";
import { receiptInput } from "@app/platform/schemas.js";

const sendReceiptJob = defineJob({
  input: receiptInput,
  target: sendReceipt,
  retry: { maxAttempts: 3 },
  concurrency: 4,
  idempotency: { key: "orderId", retentionMs: 86_400_000 },
});`;
