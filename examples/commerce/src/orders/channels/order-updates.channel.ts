import { defineChannel } from "@relkit/app/realtime";
import { z } from "@relkit/app/schema";

const orderUpdates = defineChannel({
  id: "orders.updates",
  params: z.object({ orderId: z.string().min(1) }),
  events: {
    "status.changed": z.object({
      orderId: z.string(),
      status: z.string(),
      totalCents: z.number().int().nonnegative(),
    }),
  },
  client: {
    authorize: async (_params: unknown, context: unknown) =>
      typeof context === "object" && context !== null && "auth" in context,
  },
  replay: { retentionMs: 300_000, maxEvents: 10_000 },
  presence: "count",
});

export default orderUpdates;
