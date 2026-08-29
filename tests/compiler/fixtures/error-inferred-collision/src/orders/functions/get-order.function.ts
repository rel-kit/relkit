import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

export default defineFunction({
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async (input) => input,
});
