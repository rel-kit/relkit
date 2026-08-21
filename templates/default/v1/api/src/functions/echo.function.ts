import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const echo = defineFunction({
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  handler: async ({ message }) => ({ message }),
});

export default echo;
