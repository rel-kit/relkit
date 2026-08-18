import { defineFunction } from "@zsys/app";
import getOrder from "./get-order.function.js";
import sendReceiptJob from "../jobs/send-receipt.job.js";
import { receiptObjectName } from "../shared/receipt-object.js";
import { orderCreatedEnvelope } from "../shared/schemas.js";

const handleOrderCreated = defineFunction({
  id: "orders.handle-created",
  input: orderCreatedEnvelope,
  output: orderCreatedEnvelope,
  dependencies: { functions: { getOrder }, jobs: { sendReceiptJob } },
  handler: async (input, context) => {
    const order = await context.functions.getOrder({ orderId: input.payload.orderId });
    const receiptKey = receiptObjectName(order.orderId);
    await context.jobs.sendReceiptJob.enqueue({
      orderId: input.payload.orderId,
      receiptKey,
    });
    return input;
  },
});

export default handleOrderCreated;
