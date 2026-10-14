/** Returns the validated demonstration deletion result consumed by the order DELETE route. */
import { defineFunction } from "@relkit/app/functions";
import { orderDeleteInput, orderDeleteOutput } from "../../../platform/schemas.js";

const deleteOrder = defineFunction({
  input: orderDeleteInput,
  output: orderDeleteOutput,
  handler: async ({ orderId }) => ({ orderId, deleted: true }),
});

export default deleteOrder;
