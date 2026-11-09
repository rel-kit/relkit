import { defineFunction } from "relkit/functions";
import { z } from "zod";
import sendReceiptJob from "./send-receipt.job.js";

const queueReceipt = defineFunction({
  input: sendReceiptJob.input,
  output: z.object({ accepted: z.boolean(), runId: z.string() }),
  dependencies: { jobs: { sendReceipt: sendReceiptJob } },
  handler: async (input, context) => {
    const run = await context.jobs.sendReceipt.trigger(input);
    return { accepted: run.accepted, runId: run.runId };
  },
});

export default queueReceipt;
