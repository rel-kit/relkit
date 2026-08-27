import { defineEvent } from "@relkit/app";
import { z } from "@relkit/schema";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  payload: z.object({
    orderId: z.string().min(1),
    sku: z.string().min(1),
    totalCents: z.number().int().nonnegative(),
  }),
  title: "Order created",
});

export default orderCreated;
