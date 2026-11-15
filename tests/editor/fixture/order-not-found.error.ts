/** Declared error with typed data. */
import { defineError } from "relkit/functions";
import { s } from "relkit/schema";

export default defineError({
  id: "orders.not-found",
  data: s.object({ orderId: s.string() }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
  retry: "never",
});
