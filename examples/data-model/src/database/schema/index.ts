import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  active: integer({ mode: "boolean" }).notNull().default(true),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    organizationId: text().notNull(),
    userId: integer().notNull(),
    role: text().notNull(),
  },
  (table) => [uniqueIndex("membership_identity").on(table.organizationId, table.userId)],
);
