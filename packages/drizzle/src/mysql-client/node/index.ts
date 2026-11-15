/** MySQL on Node: a `mysql2` connection pool through Drizzle's `mysql2` driver. */
import { drizzle } from "drizzle-orm/mysql2";
import type { MysqlDatabase, OpenMysql } from "../mysql-client.types.js";

/** Connects to a MySQL URL with a `mysql2` pool; it connects on the first query. */
export const openNodeMysql: OpenMysql = (url, config) =>
  drizzle({ ...config, connection: url }) as unknown as MysqlDatabase<never>;
