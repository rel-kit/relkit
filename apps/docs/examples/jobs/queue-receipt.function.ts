import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import sendReceiptJob from "./send-receipt.job.js";

const queueReceipt = defineFunction({
  input: sendReceiptJob.input,
  output: z.object({ accepted: z.boolean(), instanceId: z.string() }),
  dependencies: { jobs: { sendReceipt: sendReceiptJob } },
  handler: async (input, context) => {
    const result = await context.jobs.sendReceipt.enqueue(input);
    return { accepted: result.accepted, instanceId: result.instanceId };
  },
});

export default queueReceipt;
