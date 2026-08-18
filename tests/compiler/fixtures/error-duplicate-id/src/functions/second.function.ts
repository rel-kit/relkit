import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const second = defineFunction({
  id: "duplicate.function",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async (input) => input,
});

export default second;
