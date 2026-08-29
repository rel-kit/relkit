import { defineFunction } from "@relkit/app/functions";
import { orderDeleteInput, orderDeleteOutput } from "@app/platform/schemas.js";

const deleteOrder = defineFunction({
  input: orderDeleteInput,
  output: orderDeleteOutput,
  handler: async ({ orderId }) => ({ orderId, deleted: true }),
});

export default deleteOrder;
