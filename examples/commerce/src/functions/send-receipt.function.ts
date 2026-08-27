import { defineFunction } from "@relkit/app";
import assets from "@app/buckets/assets.bucket.js";
import { receiptInput, receiptOutput } from "@app/shared/schemas.js";

const sendReceipt = defineFunction({
  input: receiptInput,
  output: receiptOutput,
  dependencies: { buckets: { assets } },
  handler: async (input, context) => {
    context.log.info("receipt.sent", {
      orderId: input.orderId,
      receiptKey: input.receiptKey,
    });
    await context.buckets.assets.put(
      input.receiptKey,
      new TextEncoder().encode(JSON.stringify({ orderId: input.orderId })),
      { contentType: "application/json" },
    );
    return { receiptId: `${input.orderId}:${input.receiptKey}` };
  },
});

export default sendReceipt;
