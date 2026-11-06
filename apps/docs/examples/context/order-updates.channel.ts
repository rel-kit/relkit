import { defineChannel } from "relkit/realtime";
import { z } from "zod";

const orderUpdates = defineChannel({
  id: "orders.updates",
  params: z.object({ orderId: z.string().min(1) }),
  events: {
    created: z.object({ orderId: z.string(), totalCents: z.number().int().nonnegative() }),
  },
});

export default orderUpdates;
