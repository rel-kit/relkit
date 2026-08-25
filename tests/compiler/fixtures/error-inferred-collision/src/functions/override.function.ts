import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

export default defineFunction({
  id: "orders.get-order",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async (input) => input,
});
