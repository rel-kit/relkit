import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

const second = defineFunction({
  id: "duplicate.function",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async (input) => input,
});

export default second;
