import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

export default defineFunction({
  input: z.object({}),
  output: z.array(z.object({ id: z.number(), email: z.string() })),
  handler: (_input, context) => context.database.users.findMany(),
});
