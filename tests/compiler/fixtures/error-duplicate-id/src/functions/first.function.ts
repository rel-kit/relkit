import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

const first = defineFunction({
  id: "duplicate.function",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async (input) => input,
});

export default first;
