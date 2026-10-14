/** Defines the SQLite announcement rows consumed by the feed functions, retaining message and creation time. */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const announcements = sqliteTable("announcements", {
  id: integer().primaryKey({ autoIncrement: true }),
  message: text().notNull(),
  createdAt: text("created_at").notNull(),
});
