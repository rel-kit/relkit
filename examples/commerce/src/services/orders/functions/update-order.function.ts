/** Returns the requested demonstration order state after publishing its update to the order-specific channel. */
import { defineFunction } from "@relkit/app/functions";
import { orderLookupOutput, orderMutationInput } from "../../../platform/schemas.js";
import orderUpdates from "../channels/order-updates.channel.js";

const updateOrder = defineFunction({
  input: orderMutationInput,
  output: orderLookupOutput,
  handler: async ({ orderId, state }) => {
    const result = { orderId, status: state, totalCents: 1_000 };
    await orderUpdates.trigger({ orderId }, "status.changed", result);
    return result;
  },
});

export default updateOrder;
