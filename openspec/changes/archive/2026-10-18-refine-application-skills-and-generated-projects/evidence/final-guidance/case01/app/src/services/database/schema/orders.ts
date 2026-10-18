import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

export const orders = sqliteTable("orders", {
  id: text().primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  sku: text().notNull(),
  quantity: integer().notNull(),
});
