import { defineFunction } from "@relkit/app";
import { orderLookupOutput, orderMutationInput } from "../../shared/schemas.js";

const updateOrder = defineFunction({
  input: orderMutationInput,
  output: orderLookupOutput,
  handler: async ({ orderId, state }) => ({ orderId, status: state, totalCents: 1_000 }),
});

export default updateOrder;
