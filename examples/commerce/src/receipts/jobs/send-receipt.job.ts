import { defineJob } from "@relkit/app/jobs";
import sendReceipt from "@app/receipts/functions/send-receipt.function.js";
import { receiptInput } from "@app/platform/schemas.js";

const sendReceiptJob = defineJob({
  id: "receipts.send-job",
  input: receiptInput,
  target: sendReceipt,
  profile: "default",
  // #region receipt-retry
  // Retry explicitly retryable declared failures with bounded exponential backoff.
  retry: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 10_000,
    multiplier: 2,
    jitter: "none",
  },
  timeoutMs: 5_000,
  concurrency: 4,
  // #endregion receipt-retry
  // #region receipt-schedule
  // Hourly enqueue attempts; the constant orderId also shares the idempotency window below.
  schedule: [
    {
      id: "receipts.reconcile",
      cron: "0 * * * *",
      timezone: "UTC",
      input: { orderId: "scheduled", receiptKey: "scheduled.json" },
      overlap: "skip",
    },
  ],
  // #endregion receipt-schedule
  // #region receipt-idempotency
  // The local provider suppresses duplicate admission for the same order for 24 hours.
  idempotency: { key: "orderId", retentionMs: 86_400_000 },
  // #endregion receipt-idempotency
});

export default sendReceiptJob;
