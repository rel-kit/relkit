import { defineFunction } from "@zsys/app";
import { orderSearchInput, orderSearchOutput } from "../shared/schemas.js";

const searchOrders = defineFunction({
  id: "orders.search",
  input: orderSearchInput,
  output: orderSearchOutput,
  handler: async ({ status }) => ({ status: status ?? "all", count: 1 }),
});

export default searchOrders;
