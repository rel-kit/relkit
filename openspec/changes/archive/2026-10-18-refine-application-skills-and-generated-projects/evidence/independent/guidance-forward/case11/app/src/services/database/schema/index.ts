import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const items = sqliteTable("items", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
});

export const orders = sqliteTable("orders", {
  id: text().primaryKey(),
  userId: text("user_id").notNull(),
  label: text().notNull(),
});
