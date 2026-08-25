import { defineFunction } from "@zsys/app";
import receiptJob from "../jobs/send-receipt.job.js";
import { eventEnvelope } from "../shared/schemas.js";

const handleCreated = defineFunction({
  id: "orders.handle-created",
  input: eventEnvelope,
  output: eventEnvelope,
  dependencies: { jobs: { receiptJob } },
  handler: async (input, context) => {
    await context.jobs.receiptJob.enqueue({ orderId: input.payload.orderId });
    return input;
  },
});

export default handleCreated;
