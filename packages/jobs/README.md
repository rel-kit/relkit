# @relkit/jobs

Jobs declare typed input, a function target, retry policy, and optional
schedule metadata. A job does not own a handler.

```ts
import { defineJob } from "@relkit/app/jobs";
import sendReceipt from "./send-receipt.function";
import { z } from "@relkit/app/schema";

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

Function handlers call other descriptors with `target.invoke(input)`; function
dependencies are not declared in the context. Declared application errors
with omitted or `never` retry stop a delivery. A retryable error can use
`{ kind: "later", afterMs }` to require a minimum delay in addition to the job
policy. Direct function and tool calls do not retry automatically.
