import { defineEvent } from "@relkit/app/events";
import { z } from "@relkit/app/schema";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  input: z.object({
    orderId: z.string().min(1),
    sku: z.string().min(1),
    totalCents: z.number().int().nonnegative(),
  }),
});

export default orderCreated;
