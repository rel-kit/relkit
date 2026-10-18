import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export * from "./auth.js";
export { orders } from "./orders.js";

export const notes = sqliteTable("notes", {
  id: integer().primaryKey(),
  content: text().notNull(),
});
