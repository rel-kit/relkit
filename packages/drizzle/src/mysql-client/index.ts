/** Connects to MySQL with the driver of the runtime the application runs on. */
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations";
import type { MysqlDatabase, MysqlDatabaseConfig } from "./mysql-client.types.js";
export type { MysqlDatabase, MysqlDatabaseConfig } from "./mysql-client.types.js";

/**
 * Connects to a MySQL database with Bun's built-in SQL client on Bun and `mysql2` on Node, so
 * one Drizzle service runs on both. Only the current runtime's driver is loaded: a Node
 * application needs `mysql2` installed, a Bun application needs nothing more.
 * @param url - Connection URL, such as `mysql://user:password@localhost:3306/app`.
 * @param config - Drizzle settings, such as `logger`, passed to the runtime's driver.
 * @returns The Drizzle database; end its connections with `database.$client.end()`.
 * @example
 * ```ts
 * import { openMysqlDatabase } from "@relkit/drizzle/mysql";
 *
 * // Nothing connects until the first query runs, such as `database.execute(sql\`select 1\`)`.
 * const database = await openMysqlDatabase("mysql://app@localhost:3306/app");
 * console.assert(typeof database.execute === "function");
 * await database.$client.end();
 * ```
 * @category Database
 * @since 0.9.1
 */
export async function openMysqlDatabase<Relations extends AnyRelations = EmptyRelations>(
  url: string,
  config?: MysqlDatabaseConfig<Relations>,
): Promise<MysqlDatabase<Relations>> {
  const open =
    typeof process.versions.bun === "string"
      ? (await import("./bun/index.js")).openBunMysql
      : (await import("./node/index.js")).openNodeMysql;
  return open(url, config);
}
