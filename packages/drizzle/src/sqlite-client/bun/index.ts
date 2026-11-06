/** SQLite on Bun: `bun:sqlite` through Drizzle's `bun-sqlite` driver. */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { OpenSqlite, SqliteDatabase } from "../sqlite-client.types.js";

/** Opens a database file with `bun:sqlite`, creating its folder. */
export const openBunSqlite: OpenSqlite = (path, config) => {
  if (path !== ":memory:" && !path.startsWith("file:"))
    mkdirSync(dirname(path), { recursive: true });
  return drizzle({ ...config, client: new Database(path) }) as unknown as SqliteDatabase<never>;
};
