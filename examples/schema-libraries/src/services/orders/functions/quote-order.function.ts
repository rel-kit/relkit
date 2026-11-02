/** Prices an order; its input and output are Zod 4 schemas. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "zod";

export default defineFunction({
  id: "orders.quote-order",
  input: z.object({
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
  }),
  output: z.object({ sku: z.string(), totalCents: z.number().int() }),
  handler: async ({ sku, quantity }) => ({ sku, totalCents: quantity * 1_250 }),
});
