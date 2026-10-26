/** Minimal native table for owner/acquisition tests that never query a persisted auth account.
 * The migrated application test separately exercises the maintained full auth schema and DDL.
 */
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", { id: text().primaryKey(), email: text().notNull() });
