import { defineFunction } from "@relkit/app/functions";
import { orderLookupOutput, orderMutationInput } from "@app/platform/schemas.js";
import orderUpdates from "@app/orders/channels/order-updates.channel.js";

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
