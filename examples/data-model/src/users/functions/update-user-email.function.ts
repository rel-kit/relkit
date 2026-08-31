import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineFunction({
  input: z.object({ userId: z.number().int().positive(), email: z.string().email() }),
  output: z.object({ userId: z.number(), email: z.string() }).nullable(),
  handler: async ({ userId, email }, context) => {
    const data = context.database.zodSchemas.users.update.parse({ email });
    const row = await context.database.users.update({ where: { id: userId }, data });
    if (row === null) return null;
    const user = context.database.zodSchemas.users.select.parse(row);
    return { userId: user.id, email: user.email };
  },
});
