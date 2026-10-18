import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const path = process.env.DATABASE_PATH;
if (!path?.trim() || path === ":memory:") {
  throw new Error("Set DATABASE_PATH to a persistent SQLite file");
}
mkdirSync(dirname(path), { recursive: true });
const client = new Database(path, { create: true });
try {
  client.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  console.log("SQLite migrations applied");
} finally {
  client.close();
}
