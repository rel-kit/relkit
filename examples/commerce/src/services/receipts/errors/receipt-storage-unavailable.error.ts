/** Declares the receipt bucket failure exposed by sendReceipt, retaining its affected key and delayed-retry policy. */
import { defineError } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineError({
  id: "receipts.storage-unavailable",
  data: z.object({
    /** Bucket key whose write failed and can be retried by the caller. */
    receiptKey: z.string(),
  }),
  message: "Receipt storage is temporarily unavailable",
  retry: { kind: "later", afterMs: 10 },
});
