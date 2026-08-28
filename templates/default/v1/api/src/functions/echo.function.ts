import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const echo = defineFunction({
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  handler: async ({ message }) => ({ message }),
});

export default echo;
