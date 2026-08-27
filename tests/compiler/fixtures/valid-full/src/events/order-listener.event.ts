import { onEvent } from "@relkit/app";
import receiptJob from "../jobs/send-receipt.job.js";

const listener = onEvent(
  "orders.created",
  async (payload, context) => {
    await context.jobs.receiptJob.enqueue({ orderId: payload.orderId });
  },
  {
    id: "orders.listener",
    profile: "default",
    dependencies: { jobs: { receiptJob } },
    retry: {
      maxAttempts: 2,
      initialDelayMs: 1,
      maxDelayMs: 5,
      multiplier: 2,
      jitter: "none",
    },
  },
);

export default listener;
