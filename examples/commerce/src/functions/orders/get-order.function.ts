import { defineFunction } from "@relkit/app/functions";
import orderNotFound from "@app/errors/order-not-found.error.js";
import { orderLookupInput, orderLookupOutput } from "@app/shared/schemas.js";

const getOrder = defineFunction({
  input: orderLookupInput,
  output: orderLookupOutput,
  errors: [orderNotFound],
  handler: async (input) => {
    if (input.orderId === "missing") return new orderNotFound(input);
    return { orderId: input.orderId, status: "confirmed", totalCents: 1_000 };
  },
});

export default getOrder;
