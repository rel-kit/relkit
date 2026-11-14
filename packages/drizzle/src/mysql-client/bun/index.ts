/** MySQL on Bun: Bun's built-in SQL client through Drizzle's `bun-sql` driver. */
import { drizzle } from "drizzle-orm/bun-sql";
import type { MysqlDatabase, OpenMysql } from "../mysql-client.types.js";

/** Connects to a MySQL URL with Bun's SQL client; it connects on the first query. */
export const openBunMysql: OpenMysql = (url, config) =>
  drizzle.mysql({ ...config, connection: url }) as unknown as MysqlDatabase<never>;
