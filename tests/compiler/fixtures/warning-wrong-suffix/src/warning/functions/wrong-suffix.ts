import { defineFunction } from "relkit";
import { z } from "relkit/schema";

const warningSuffix = defineFunction({
  id: "warning.suffix",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async (input) => input,
});

export default warningSuffix;
