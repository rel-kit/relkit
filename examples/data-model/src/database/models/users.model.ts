import { defineModel, type UpdateArgs } from "@relkit/drizzle";
import { eq, like } from "drizzle-orm";
import { users } from "../schema/index.js";

export default defineModel({
  table: users,
  extend: {
    byEmailDomain: ({ table, database }, domain: string) =>
      database
        .select()
        .from(table)
        .where(like(table.email, `%@${domain}`)),
    findOneAndUpdate: async ({ table, database }, args: UpdateArgs<typeof users>) => {
      const id = args.where.id;
      if (id === undefined) return null;
      const [existing] = await database.select().from(table).where(eq(table.id, id));
      if (existing === undefined || existing.active === false) return null;
      const [updated] = await database
        .update(table)
        .set(args.data)
        .where(eq(table.id, id))
        .returning();
      return updated ?? null;
    },
  },
});
