import { defineError, defineFunction } from "@relkit/app";
import { errorData, orderInput, orderOutput } from "../../shared/schemas.js";

const InvalidError = defineError({
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
