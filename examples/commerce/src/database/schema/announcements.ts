import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const announcements = sqliteTable("announcements", {
  id: integer().primaryKey({ autoIncrement: true }),
  message: text().notNull(),
  createdAt: text("created_at").notNull(),
});
