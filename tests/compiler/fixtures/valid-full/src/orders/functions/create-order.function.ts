import { defineFunction } from "@relkit/app";
import prices from "../cache/prices.cache.js";
import { orderInput, orderOutput } from "../../platform/schemas.js";

const createOrder = defineFunction({
  id: "orders.create",
  input: orderInput,
  output: orderOutput,
  dependencies: { cache: { prices } },
  handler: async (input, context) => {
    await context.cache.prices.get({ sku: input.sku });
    return { orderId: input.orderId, totalCents: 100 };
  },
});

export default createOrder;
