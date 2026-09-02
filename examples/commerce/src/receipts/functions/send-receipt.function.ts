import { defineFunction } from "@relkit/app/functions";
import receipts from "@app/receipts/buckets/receipts.bucket.js";
import { receiptInput, receiptOutput } from "@app/platform/schemas.js";

const sendReceipt = defineFunction({
  input: receiptInput,
  output: receiptOutput,
  dependencies: { buckets: { receipts } },
  handler: async (input, context) => {
    context.log.info("receipt.sent", {
      orderId: input.orderId,
      receiptKey: input.receiptKey,
    });
    await context.buckets.receipts.put(
      input.receiptKey,
      new TextEncoder().encode(JSON.stringify({ orderId: input.orderId })),
      { contentType: "application/json" },
    );
    return { receiptId: `${input.orderId}:${input.receiptKey}` };
  },
});

export default sendReceipt;
