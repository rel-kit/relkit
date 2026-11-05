/**
 * An idempotent task for an at-least-once backend. The payment provider
 * receives a key derived from the order, not from the run or attempt, so a
 * re-run after a crash or a retry returns the first charge instead of charging
 * twice. The job's idempotency key also stops a second submission for the
 * same order from creating a second run.
 */
import { defineJob, defineTask } from "relkit/jobs";
import { z } from "zod";

/** Stand-in for a payment SDK that deduplicates by idempotency key. */
const payments = {
  charges: new Map<string, string>(),
  async charge(request: { readonly amountCents: number; readonly idempotencyKey: string }) {
    const existing = payments.charges.get(request.idempotencyKey);
    if (existing !== undefined) return { id: existing };
    const id = `ch_${payments.charges.size + 1}`;
    payments.charges.set(request.idempotencyKey, id);
    return { id };
  },
};

export const chargeOrderTask = defineTask({
  id: "orders.charge",
  version: "1",
  input: z.object({ orderId: z.string().min(1), amountCents: z.number().int().positive() }),
  output: z.object({ chargeId: z.string() }),
  retry: { maxAttempts: 5, initialDelay: "1 second", maxDelay: "30 seconds", factor: 2 },
  handler: async ({ orderId, amountCents }) => {
    const charge = await payments.charge({ amountCents, idempotencyKey: `charge:${orderId}` });
    return { chargeId: charge.id };
  },
});

const chargeOrderJob = defineJob({
  id: "orders.charge-job",
  name: "chargeOrder",
  task: chargeOrderTask,
  admission: { idempotency: { key: "orderId", retention: "7 days" } },
});

export default chargeOrderJob;
