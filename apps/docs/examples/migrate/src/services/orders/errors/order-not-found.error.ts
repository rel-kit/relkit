/** Declares the missing-order failure and its HTTP 404 status. */
import { defineError } from "relkit/functions";
import { z } from "zod";

const orderNotFound = defineError({
  id: "orders.not-found",
  data: z.object({ orderId: z.string() }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
});

export default orderNotFound;
