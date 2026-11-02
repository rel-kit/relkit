/** Looks up one order, returning the declared not-found error for unknown identifiers. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import orderNotFound from "../errors/order-not-found.error.js";

const getOrder = defineFunction({
  input: z.object({ orderId: z.string().min(1) }),
  output: z.object({ orderId: z.string(), status: z.string(), totalCents: z.number().int() }),
  errors: [orderNotFound],
  handler: async ({ orderId }) => {
    if (orderId === "missing") return new orderNotFound({ orderId });
    return { orderId, status: "confirmed", totalCents: 1_000 };
  },
});

export default getOrder;
