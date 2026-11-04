import { defineError, defineFunction } from "relkit";
import { errorData, orderInput, orderOutput } from "../../platform/schemas.js";

const InvalidError = defineError({
  id: "orders.functions.get-order-function.InvalidError",
  data: errorData,
  message: ({ orderId }) => `Invalid order ${orderId}`,
  http: { status: 400 },
  retry: "never",
});

const getOrder = defineFunction({
  input: orderInput,
  output: orderOutput,
  errors: [InvalidError],
  handler: async (input) => ({ orderId: input.orderId, ok: true }),
});

export default getOrder;
