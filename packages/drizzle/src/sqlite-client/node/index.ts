/** SQLite on Node: the built-in `node:sqlite` through Drizzle's `node-sqlite` driver. */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import type { OpenSqlite, SqliteDatabase } from "../sqlite-client.types.js";

/** Opens a database file with `node:sqlite` (Node 22.13 or later), creating its folder. */
export const openNodeSqlite: OpenSqlite = (path, config) => {
  if (path !== ":memory:" && !path.startsWith("file:"))
    mkdirSync(dirname(path), { recursive: true });
  return drizzle({ ...config, client: new DatabaseSync(path) }) as unknown as SqliteDatabase<never>;
};
