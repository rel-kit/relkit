import { defineFunction } from "@zsys/app";
import orderNotFound from "../errors/order-not-found.error.js";
import { orderLookupInput, orderLookupOutput } from "../shared/schemas.js";

const getOrder = defineFunction({
  id: "orders.get",
  input: orderLookupInput,
  output: orderLookupOutput,
  errors: [orderNotFound],
  handler: async (input) => {
    if (input.orderId === "missing") throw orderNotFound.create(input);
    return { orderId: input.orderId, status: "confirmed", totalCents: 1_000 };
  },
});

export default getOrder;
