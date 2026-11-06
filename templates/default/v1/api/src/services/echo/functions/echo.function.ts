/** Echoes a nonempty message through the service's validated function and inferred HTTP contract. */
import { defineFunction } from "relkit/functions";
import { z } from "zod";

const echo = defineFunction({
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  handler: async ({ message }) => ({ message }),
});

export default echo;
