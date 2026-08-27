import { defineFunction } from "@relkit/app";
import { orderSearchInput, orderSearchOutput } from "@app/shared/schemas.js";

const searchOrders = defineFunction({
  input: orderSearchInput,
  output: orderSearchOutput,
  handler: async ({ status }) => ({ status: status ?? "all", count: 1 }),
});

export default searchOrders;
