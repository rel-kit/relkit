import { defineJob, defineTask } from "relkit/jobs";
import { z } from "zod";

export const chargeOrderTask = defineTask({
  id: "orders.charge",
  version: "1",
  input: z.object({ orderId: z.string().min(1), amountCents: z.number().int().positive() }),
  output: z.object({ chargeId: z.string() }),
  handler: async ({ orderId, amountCents }, context) => {
    // A re-run after a crash repeats this call. The key derives from the order, not from the run,
    // so the payment provider returns the first charge instead of creating a second one.
    const response = await fetch("https://payments.example.com/charges", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `charge:${orderId}` },
      body: JSON.stringify({ orderId, amountCents }),
      signal: context.signal,
    });
    if (!response.ok) throw new Error(`Charge failed with status ${response.status}`);
    const charge = z.object({ id: z.string() }).parse(await response.json());
    return { chargeId: charge.id };
  },
});

const chargeOrderJob = defineJob({
  id: "orders.charge-job",
  name: "chargeOrder",
  task: chargeOrderTask,
  service: "queue",
});

export default chargeOrderJob;
