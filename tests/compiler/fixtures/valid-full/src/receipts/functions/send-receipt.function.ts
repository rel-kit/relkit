import { defineFunction } from "@relkit/app";
import { receiptInput, receiptOutput } from "../../platform/schemas.js";

const sendReceipt = defineFunction({
  id: "receipts.send",
  input: receiptInput,
  output: receiptOutput,
  handler: async (input) => ({ receiptId: input.orderId }),
});

export default sendReceipt;
