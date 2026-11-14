/** Connects to PostgreSQL with the driver of the runtime the application runs on. */
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations";
import type { PostgresDatabase, PostgresDatabaseConfig } from "./pg-client.types.js";
export type { PostgresDatabase, PostgresDatabaseConfig } from "./pg-client.types.js";

/**
 * Connects to a PostgreSQL database with Bun's built-in SQL client on Bun and `pg` on Node, so
 * one Drizzle service runs on both. Only the current runtime's driver is loaded: a Node
 * application needs `pg` installed, a Bun application needs nothing more.
 * @param url - Connection URL, such as `postgres://user:password@localhost:5432/app`.
 * @param config - Drizzle settings, such as `logger`, passed to the runtime's driver.
 * @returns The Drizzle database; end its connections with `database.$client.end()`.
 * @example
 * ```ts
 * import { openPostgresDatabase } from "@relkit/drizzle/pg";
 *
 * // Nothing connects until the first query runs, such as `database.execute(sql\`select 1\`)`.
 * const database = await openPostgresDatabase("postgres://app@localhost:5432/app");
 * console.assert(typeof database.execute === "function");
 * await database.$client.end();
 * ```
 * @category Database
 * @since 0.9.1
 */
export async function openPostgresDatabase<Relations extends AnyRelations = EmptyRelations>(
  url: string,
  config?: PostgresDatabaseConfig<Relations>,
): Promise<PostgresDatabase<Relations>> {
  const open =
    typeof process.versions.bun === "string"
      ? (await import("./bun/index.js")).openBunPostgres
      : (await import("./node/index.js")).openNodePostgres;
  return open(url, config);
}
