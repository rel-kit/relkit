/** Checks stock for a SKU; its input and output are ArkType schemas, and it can fail with an ArkType error. */
import { defineFunction, fail } from "relkit/functions";
import { type } from "arktype";
import OutOfStock from "../errors/out-of-stock.error.js";

export default defineFunction({
  id: "orders.check-stock",
  input: type({ sku: "string > 0", quantity: "number.integer > 0" }),
  output: type({ sku: "string", available: "number.integer >= 0" }),
  errors: [OutOfStock],
  handler: async ({ sku, quantity }) => {
    const available = sku === "sold-out" ? 0 : 100;
    if (quantity > available) return fail(OutOfStock, { sku, available });
    return { sku, available };
  },
});
