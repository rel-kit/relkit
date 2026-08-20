import { defineFunction } from "@zsys/app";
import { orderLookupOutput, orderMutationInput } from "../shared/schemas.js";

const updateOrder = defineFunction({
  id: "orders.update",
  input: orderMutationInput,
  output: orderLookupOutput,
  handler: async ({ orderId, state }) => ({ orderId, status: state, totalCents: 1_000 }),
});

export default updateOrder;
