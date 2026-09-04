import { defineFunction } from "@relkit/app/functions";
import receipts from "@app/receipts/buckets/receipts.bucket.js";
import { receiptInput, receiptOutput } from "@app/platform/schemas.js";
import receiptStorageUnavailable from "../errors/receipt-storage-unavailable.error.js";

const sendReceipt = defineFunction({
  input: receiptInput,
  output: receiptOutput,
  errors: [receiptStorageUnavailable],
  dependencies: { buckets: { receipts } },
  handler: async (input, context) => {
    context.log.info("receipt.sent", {
      orderId: input.orderId,
      receiptKey: input.receiptKey,
    });
    try {
      await context.buckets.receipts.put(
        input.receiptKey,
        new TextEncoder().encode(JSON.stringify({ orderId: input.orderId })),
        { contentType: "application/json" },
      );
    } catch (cause) {
      if (context.signal.aborted) throw cause;
      return new receiptStorageUnavailable({ receiptKey: input.receiptKey });
    }
    return { receiptId: `${input.orderId}:${input.receiptKey}` };
  },
});

export default sendReceipt;
