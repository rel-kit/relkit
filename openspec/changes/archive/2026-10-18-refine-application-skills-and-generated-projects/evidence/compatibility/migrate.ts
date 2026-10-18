/** Finite disposable-fixture probe; opens only the path supplied by its owning harness. */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const path = process.argv[2];
if (!path) throw new Error("A disposable database path is required");
const client = new Database(path, { create: true });
try {
  client.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const result = migrate(drizzle({ client }), { migrationsFolder: "./history" });
  if (result !== undefined) throw new Error(JSON.stringify(result));
  if (process.argv.includes("--seed")) {
    client.query("INSERT INTO items (name) VALUES (?)").run("preserved business row");
  }
  console.log(
    JSON.stringify({
      schema: client
        .query("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all(),
      rows: client.query("SELECT * FROM items").all(),
      log: client.query("SELECT * FROM __drizzle_migrations ORDER BY id").all(),
    }),
  );
} finally {
  client.close();
}
