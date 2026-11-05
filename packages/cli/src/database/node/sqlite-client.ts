/** Opens a SQLite file for `relkit db migrate` on Node with `node:sqlite`. */
import { DatabaseSync } from "node:sqlite";
import type { MigrationSqlite } from "../migration-sqlite.types.js";

/**
 * Opens or creates a database file.
 * @param path - Absolute database file.
 * @returns The connection.
 */
export function openNodeSqlite(path: string): MigrationSqlite {
  const client = new DatabaseSync(path);
  return {
    client,
    exec: (sql) => client.exec(sql),
    close: () => client.close(),
  };
}
