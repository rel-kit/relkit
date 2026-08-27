import { Database } from "bun:sqlite";
import { defineDataModel } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
});

// Use a local SQLite file so this executable example needs no external database.
export const sqlite = new Database(process.env.DATABASE_PATH ?? ".relkit/commerce.sqlite", {
  create: true,
});
export const database = drizzle({ client: sqlite });

export function initializeDatabase(): void {
  // The example creates its table at startup; production apps should use migrations.
  sqlite.exec(
    "create table if not exists users (id integer primary key autoincrement, email text not null unique)",
  );
}

// RELKIT derives checked operations and execution context from the Drizzle schema.
export default defineDataModel(database, { users });
