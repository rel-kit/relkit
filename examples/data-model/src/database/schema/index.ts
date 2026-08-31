import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// #region users-table
export const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  active: integer({ mode: "boolean" }).notNull().default(true),
});
// #endregion users-table

// #region memberships-table
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
// #endregion memberships-table
