import { defineEvent } from "@relkit/app/events";
import { z } from "@relkit/app/schema";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,

  // Data every subscriber receives when an order is created.
  input: z.object({
    orderId: z.string().min(1),
    sku: z.string().min(1),
    totalCents: z.number().int().nonnegative(),
  }),

  title: "Order created",
});

export default orderCreated;
