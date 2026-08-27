import { defineFunction } from "@relkit/app";
import { lookupInput, orderOutput } from "../shared/schemas.js";

const getOrder = defineFunction({
  id: "orders.get",
  input: lookupInput,
  output: orderOutput,
  handler: async (input) => ({ orderId: input.orderId, totalCents: 100 }),
});

export default getOrder;
