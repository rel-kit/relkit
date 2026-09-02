import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export const receiptInput = z.object({
  orderId: z.string().min(1),
  receiptKey: z.string().min(1),
});

const sendReceipt = defineFunction({
  input: receiptInput,
  output: z.object({ receiptId: z.string() }),
  handler: async ({ orderId, receiptKey }) => ({ receiptId: `${orderId}:${receiptKey}` }),
});

export default sendReceipt;
