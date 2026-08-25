import { defineFunction } from "@zsys/app";
import { orderDeleteInput, orderDeleteOutput } from "../../shared/schemas.js";

const deleteOrder = defineFunction({
  input: orderDeleteInput,
  output: orderDeleteOutput,
  handler: async ({ orderId }) => ({ orderId, deleted: true }),
});

export default deleteOrder;
