/** Supplies the orders service with a validated health result independent of job execution. */
import { defineFunction } from "relkit/functions";
import { z } from "zod";

export default defineFunction({
  id: "orders.health",
  input: z.object({}),
  output: z.object({ ok: z.literal(true) }),
  handler: async () => ({ ok: true as const }),
});
