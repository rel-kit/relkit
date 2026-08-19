import { defineJob } from "@zsys/app";
import sendReceipt from "../functions/send-receipt.function.js";
import { receiptInput } from "../shared/schemas.js";

const receiptJob = defineJob({
  id: "receipts.send-job",
  input: receiptInput,
  target: sendReceipt,
  profile: "default",
  retry: {
    maxAttempts: 2,
    initialDelayMs: 1,
    maxDelayMs: 5,
    multiplier: 2,
    jitter: "none",
  },
  schedule: [
    {
      id: "receipts.reconcile",
      cron: "0 * * * *",
      timezone: "UTC",
      input: { orderId: "scheduled" },
      overlap: "skip",
    },
  ],
  idempotency: { key: "orderId", retentionMs: 1_000 },
});

export default receiptJob;
