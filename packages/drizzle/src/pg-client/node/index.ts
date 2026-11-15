/** PostgreSQL on Node: a `pg` connection pool through Drizzle's `node-postgres` driver. */
import { drizzle } from "drizzle-orm/node-postgres";
import type { OpenPostgres, PostgresDatabase } from "../pg-client.types.js";

/** Connects to a PostgreSQL URL with a `pg` pool; it connects on the first query. */
export const openNodePostgres: OpenPostgres = (url, config) =>
  drizzle({ ...config, connection: url }) as unknown as PostgresDatabase<never>;
