import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

export default defineFunction({
  input: z.object({ domain: z.string() }),
  output: z.array(z.object({ id: z.number(), email: z.string(), active: z.boolean() })),
  handler: ({ domain }, context) => context.database.users.byEmailDomain(domain),
});
