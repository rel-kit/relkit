# @zsys/jobs

Jobs declare typed input, a function target, retry policy, and optional
schedule metadata. A job does not own a handler.

```ts
import { defineJob } from "@zsys/jobs";
import sendReceipt from "./send-receipt.function";
import { z } from "@zsys/schema";

export default defineJob({
  id: "receipts.send-job",
  input: z.object({ orderId: z.string(), receiptKey: z.string() }),
  target: sendReceipt,
  profile: "default",
  retry: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 10_000,
    multiplier: 2,
    jitter: "none",
  },
  schedule: [
    {
      id: "receipts.reconcile",
      cron: "0 * * * *",
      timezone: "UTC",
      input: { orderId: "scheduled", receiptKey: "scheduled.json" },
      overlap: "skip",
    },
  ],
});
```
