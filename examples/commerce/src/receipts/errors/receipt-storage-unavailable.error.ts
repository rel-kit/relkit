import { defineError } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineError({
  id: "receipts.storage-unavailable",
  data: z.object({ receiptKey: z.string() }),
  message: "Receipt storage is temporarily unavailable",
  retry: { kind: "later", afterMs: 10 },
});
