import { defineEventFunction } from "@relkit/app";
import receiptJob from "../jobs/send-receipt.job.js";

const listener = defineEventFunction({
  id: "receipts.listener",
  event: "orders.created",
  profile: "default",
  dependencies: { jobs: { receiptJob } },
  retry: { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 5, multiplier: 2, jitter: "none" },
  handler: async (payload, context) => {
    await context.jobs.receiptJob.enqueue({ orderId: payload.orderId });
  },
});

export default listener;
