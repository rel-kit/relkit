/** Returns a validated demonstration search count for the route's optional status query. */
import { defineFunction } from "@relkit/app/functions";
import { orderSearchInput, orderSearchOutput } from "../../../platform/schemas.js";

const searchOrders = defineFunction({
  input: orderSearchInput,
  output: orderSearchOutput,
  handler: async ({ status }) => ({ status: status ?? "all", count: 1 }),
});

export default searchOrders;
