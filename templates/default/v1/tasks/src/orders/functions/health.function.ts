import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineFunction({
  id: "orders.health",
  input: z.object({}),
  output: z.object({ ok: z.literal(true) }),
  handler: async () => ({ ok: true as const }),
});
