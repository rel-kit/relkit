import { defineJob } from "@relkit/app/jobs";
import sendReceipt, { receiptInput } from "./send-receipt.function.js";

const sendReceiptJob = defineJob({
  id: "receipts.send-job",
  input: receiptInput,
  target: sendReceipt,
  profile: "queue",
  // #region receipt-retry
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
  idempotency: { key: "orderId", retentionMs: 86_400_000 },
  // #endregion receipt-idempotency
});

export default sendReceiptJob;
