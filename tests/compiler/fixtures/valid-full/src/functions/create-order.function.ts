import { defineFunction } from "@zsys/app";
import prices from "../cache/prices.cache.js";
import orderCreated from "../events/order-created.event.js";
import { orderInput, orderOutput } from "../shared/schemas.js";

const createOrder = defineFunction({
  id: "orders.create",
  input: orderInput,
  output: orderOutput,
  dependencies: { cache: { prices }, events: { orderCreated } },
  handler: async (input, _request, context) => {
    await context.cache.prices.get({ sku: input.sku });
    await context.events.orderCreated.publish(input);
    return { orderId: input.orderId, totalCents: 100 };
  },
});

export default createOrder;
