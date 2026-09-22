import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const path = process.env.DATABASE_PATH;
if (path === undefined || path.trim() === "" || path === ":memory:") {
  throw new Error("Set DATABASE_PATH to the SQLite file you intend to migrate");
}

const sqlite = new Database(path);
try {
  await migrate(drizzle({ client: sqlite }), { migrationsFolder: resolve("drizzle") });
} finally {
  sqlite.close();
}
