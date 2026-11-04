import { defineJob, defineTask } from "@relkit/app/jobs";
import { z } from "zod";
import { receiptInput } from "./send-receipt.function.js";

export const sendReceiptTask = defineTask({
  id: "receipts.send",
  version: "1",
  input: receiptInput,
  output: z.object({ receiptId: z.string() }),
  handler: async ({ orderId, receiptKey }) => ({ receiptId: `${orderId}:${receiptKey}` }),
});

const sendReceiptJob = defineJob({
  id: "receipts.send-job",
  name: "sendReceipt",
  task: sendReceiptTask,
  service: "queue",
});

export default sendReceiptJob;
