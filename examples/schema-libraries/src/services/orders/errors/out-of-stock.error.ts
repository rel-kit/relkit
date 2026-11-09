/** Rejects an order line whose SKU has too little stock; its data is an ArkType schema. */
import { defineError } from "relkit/functions";
import { type } from "arktype";

export default defineError({
  id: "orders.out-of-stock",
  data: type({ sku: "string", available: "number.integer >= 0" }),
  message: ({ sku }) => `${sku} is out of stock`,
  http: { status: 409 },
});
