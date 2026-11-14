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
    scalar: (sql, ...parameters) => {
      const row = client.query<Record<string, number | string>, string[]>(sql).get(...parameters);
      return row === null ? undefined : Object.values(row)[0];
    },
    close: () => client.close(),
  };
}
