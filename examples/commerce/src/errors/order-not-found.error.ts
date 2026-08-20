import { defineError } from "@zsys/app";
import { z } from "@zsys/schema";

const orderNotFound = defineError({
  id: "orders.not-found",
  data: z.object({ orderId: z.string() }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
  retry: "never",
});

export default orderNotFound;
