/** PostgreSQL on Bun: Bun's built-in SQL client through Drizzle's `bun-sql` driver. */
import { drizzle } from "drizzle-orm/bun-sql";
import type { OpenPostgres, PostgresDatabase } from "../pg-client.types.js";

/** Connects to a PostgreSQL URL with Bun's SQL client; it connects on the first query. */
export const openBunPostgres: OpenPostgres = (url, config) =>
  drizzle.postgres({ ...config, connection: url }) as unknown as PostgresDatabase<never>;
