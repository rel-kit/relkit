import { defineFunction } from "relkit";
import { z } from "relkit/schema";

export default defineFunction({
  id: "orders.get-order",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async (input) => input,
});
