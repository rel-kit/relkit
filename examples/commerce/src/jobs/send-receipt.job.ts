import { defineJob } from "@relkit/app";
import sendReceipt from "@app/functions/send-receipt.function.js";
import { receiptInput } from "@app/shared/schemas.js";

const sendReceiptJob = defineJob({
  id: "receipts.send-job",
  input: receiptInput,
  target: sendReceipt,
  profile: "default",
  // Retry transient failures with bounded exponential backoff.
  retry: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 10_000,
    multiplier: 2,
    jitter: "none",
  },
  timeoutMs: 5_000,
  concurrency: 4,
  // The same target can also run on an hourly UTC schedule.
  schedule: [
    {
      id: "receipts.reconcile",
      cron: "0 * * * *",
      timezone: "UTC",
      input: { orderId: "scheduled", receiptKey: "scheduled.json" },
      overlap: "skip",
    },
  ],
  // Suppress duplicate work for the same order for 24 hours.
  idempotency: { key: "orderId", retentionMs: 86_400_000 },
});

export default sendReceiptJob;
