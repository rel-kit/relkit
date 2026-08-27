import { defineError } from "@relkit/app";
import { z } from "@relkit/schema";

const orderNotFound = defineError({
  id: "orders.not-found",
  data: z.object({ orderId: z.string() }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
  retry: { kind: "later", afterMs: 1_000 },
});

export default orderNotFound;
