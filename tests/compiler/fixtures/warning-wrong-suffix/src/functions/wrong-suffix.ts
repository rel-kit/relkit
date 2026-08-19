import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const warningSuffix = defineFunction({
  id: "warning.suffix",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async (input) => input,
});

export default warningSuffix;
