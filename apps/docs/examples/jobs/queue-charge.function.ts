import { defineFunction } from "relkit/functions";
import { z } from "zod";
import chargeOrderJob from "./charge-order.job.js";

const queueCharge = defineFunction({
  input: chargeOrderJob.input,
  output: z.object({ accepted: z.boolean(), runId: z.string() }),
  dependencies: { jobs: { chargeOrder: chargeOrderJob } },
  handler: async (input, context) => {
    // Triggering twice with the same key returns the first run instead of starting another.
    const run = await context.jobs.chargeOrder.trigger(input, {
      idempotencyKey: `charge:${input.orderId}`,
    });
    return { accepted: run.accepted, runId: run.runId };
  },
});

export default queueCharge;
