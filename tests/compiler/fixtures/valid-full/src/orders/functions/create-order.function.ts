import { defineFunction } from "@relkit/app";
import prices from "../cache/prices.cache.js";
import { orderInput, orderOutput } from "../../platform/schemas.js";

const createOrder = defineFunction({
  id: "orders.create",
  input: orderInput,
  output: orderOutput,
  dependencies: { cache: { prices } },
  publishes: ["orders.created"],
  handler: async (input, context) => {
    await context.cache.prices.get({ sku: input.sku });
    await context.events["orders.created"].publish(input);
    return { orderId: input.orderId, totalCents: 100 };
  },
});

export default createOrder;
