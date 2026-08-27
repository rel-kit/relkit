import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

const echo = defineFunction({
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  handler: async ({ message }) => ({ message }),
});

export default echo;
