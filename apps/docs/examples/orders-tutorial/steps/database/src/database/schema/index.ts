import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  orderId: text().primaryKey(),
  sku: text().notNull(),
  quantity: integer().notNull(),
  totalCents: integer().notNull(),
  ownerId: text(),
});
