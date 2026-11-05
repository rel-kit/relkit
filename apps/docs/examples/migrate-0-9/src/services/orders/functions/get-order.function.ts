import { defineFunction } from "relkit/functions";
import { s } from "relkit/schema";
import OrderNotFound from "../errors/order-not-found.error.js";

const getOrder = defineFunction({
  input: s.object({ orderId: s.string() }),
  output: s.object({ orderId: s.string() }),
  errors: [OrderNotFound],
  handler: async ({ orderId }) => ({ orderId }),
});

export default getOrder;
