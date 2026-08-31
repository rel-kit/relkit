import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import sendReceiptJob from "@app/receipts/jobs/send-receipt.job.js";

const queueReceipt = defineFunction({
  id: "receipts.queue-receipt",
  input: sendReceiptJob.input,
  output: z.object({ instanceId: z.string(), accepted: z.literal(true) }),
  dependencies: { jobs: { sendReceiptJob } },
  handler: async (input, context) => {
    const { instanceId, accepted } = await context.jobs.sendReceiptJob.enqueue(input);
    return { instanceId, accepted };
  },
});

export default queueReceipt;
