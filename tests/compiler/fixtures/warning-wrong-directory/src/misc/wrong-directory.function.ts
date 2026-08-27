import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

const warningDirectory = defineFunction({
  id: "warning.directory",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async (input) => input,
});

export default warningDirectory;
