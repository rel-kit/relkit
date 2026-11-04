/** Opens a SQLite database with the driver of the runtime the application runs on. */
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations";
import type { SqliteDatabase, SqliteDatabaseConfig } from "./sqlite-client.types.js";
export type { SqliteDatabase, SqliteDatabaseConfig } from "./sqlite-client.types.js";

/**
 * Opens a SQLite database file, creating its folder, with `bun:sqlite` on Bun and `node:sqlite`
 * on Node, so one Drizzle service runs on both.
 * @param path - Database file, or `:memory:`.
 * @param config - Drizzle settings, such as `logger`, passed to the runtime's driver.
 * @returns The Drizzle database; close it with `database.$client.close()`.
 * @example
 * ```ts
 * import { openSqliteDatabase } from "@relkit/drizzle/sqlite";
 * import { sql } from "drizzle-orm";
 *
 * const database = await openSqliteDatabase(":memory:");
 * try { console.assert((await database.all(sql`select 1 as one`)).length === 1) }
 * finally { database.$client.close() }
 * ```
 * @category Database
 * @since 0.9.0
 */
export async function openSqliteDatabase<Relations extends AnyRelations = EmptyRelations>(
  path: string,
  config?: SqliteDatabaseConfig<Relations>,
): Promise<SqliteDatabase<Relations>> {
  const open =
    typeof process.versions.bun === "string"
      ? (await import("./bun/index.js")).openBunSqlite
      : (await import("./node/index.js")).openNodeSqlite;
  return open(path, config);
}
