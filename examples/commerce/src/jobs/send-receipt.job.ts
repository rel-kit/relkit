import { defineJob } from "@zsys/app";
import sendReceipt from "../functions/send-receipt.function.js";
import { receiptInput } from "../shared/schemas.js";

const sendReceiptJob = defineJob({
  id: "receipts.send-job",
  input: receiptInput,
  target: sendReceipt,
  profile: "default",
  retry: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 10_000,
    multiplier: 2,
    jitter: "none",
  },
  timeoutMs: 5_000,
  concurrency: 4,
  schedule: [
    {
      id: "receipts.reconcile",
      cron: "0 * * * *",
      timezone: "UTC",
      input: { orderId: "scheduled", receiptKey: "scheduled.json" },
      overlap: "skip",
    },
  ],
  idempotency: { key: "orderId", retentionMs: 86_400_000 },
});

export default sendReceiptJob;
