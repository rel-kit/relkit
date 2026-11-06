/** Opens a SQLite file for `relkit db migrate` on Bun with `bun:sqlite`. */
import { Database } from "bun:sqlite";
import type { MigrationSqlite } from "../migration-sqlite.types.js";

/**
 * Opens or creates a database file.
 * @param path - Absolute database file.
 * @returns The connection.
 */
export function openBunSqlite(path: string): MigrationSqlite {
  const client = new Database(path, { create: true });
  return {
    client,
    exec: (sql) => void client.exec(sql),
    close: () => client.close(),
  };
}
