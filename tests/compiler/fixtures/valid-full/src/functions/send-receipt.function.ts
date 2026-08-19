import { defineFunction } from "@zsys/app";
import { receiptInput, receiptOutput } from "../shared/schemas.js";

const sendReceipt = defineFunction({
  id: "receipts.send",
  input: receiptInput,
  output: receiptOutput,
  handler: async (input) => ({ receiptId: input.orderId }),
});

export default sendReceipt;
