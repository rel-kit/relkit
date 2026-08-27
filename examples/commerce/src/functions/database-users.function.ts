import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

export default defineFunction({
  input: z.object({}),
  output: z.array(z.object({ id: z.number(), email: z.string() })),
  handler: (_input, context) => context.database.users.findMany(),
});
