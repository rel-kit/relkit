/** Native finite worker adapters: preflight history before opening the configured target. */
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerModule, consumerPath, usage } from "./migration-config.js";
import { MigrationFailure, type MigrationConfig } from "./migration.schemas.js";

/** Verifies readable history with the application's exact ORM version, without a connection. */
export async function preflightHistory(root: string, history: string): Promise<void> {
  const module = await consumerModule(root, "drizzle-orm/migrator");
  try {
    if (typeof module.readMigrationFiles !== "function") throw new Error("Unsupported reader");
    const files: unknown = Reflect.apply(module.readMigrationFiles, undefined, [
      { migrationsFolder: history },
    ]);
    if (
      !Array.isArray(files) ||
      files.length === 0 ||
      files.some(
        (file: unknown) =>
          file === null ||
          typeof file !== "object" ||
          !("folderMillis" in file) ||
          !Number.isFinite(file.folderMillis) ||
          !("sql" in file) ||
          !Array.isArray(file.sql) ||
          !file.sql.some((sql: unknown) => typeof sql === "string" && sql.trim().length > 0),
      )
    )
      throw new Error("Empty or invalid history");
  } catch {
    throw new MigrationFailure({
      code: "RELKIT_DB_HISTORY",
      exitCode: 2,
      message:
        "Migration history is missing, empty or incompatible. Run bun run db:generate and review history for the installed ORM/Kit versions.",
    });
  }
}

/** Applies SQLite with the Bun-native driver and the consumer's matching migrator. */
export async function migrateSqlite(
  root: string,
  config: MigrationConfig,
  history: string,
): Promise<void> {
  const url = config.dbCredentials.url;
  if (typeof url !== "string" || !url.trim() || /:memory:|[?&]mode=memory/i.test(url))
    throw usage("Set the selected config's SQLite target to a persistent file.");
  if (
    (url.startsWith("file:") && /[?#]/.test(url)) ||
    (/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("file:") && !/^[a-z]:[\\/]/i.test(url))
  )
    throw usage("SQLite migrations require a file path or file URL without URI options.");
  if (config.migrations?.schema !== undefined)
    throw usage("SQLite does not support a migration-log schema.");
  const path = url.startsWith("file://")
    ? fileURLToPath(url)
    : resolve(root, url.startsWith("file:") ? url.slice(5) : url);
  const driver = await consumerModule(root, "drizzle-orm/bun-sqlite");
  const migrator = await consumerModule(root, "drizzle-orm/bun-sqlite/migrator");
  if (typeof driver.drizzle !== "function" || typeof migrator.migrate !== "function")
    throw usage("The installed ORM must support the Bun SQLite driver and migrator.");
  await mkdir(dirname(path), { recursive: true });
  const client = new Database(path, { create: true });
  try {
    client.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    const db: unknown = Reflect.apply(driver.drizzle, undefined, [{ client }]);
    const result: unknown = Reflect.apply(migrator.migrate, undefined, [
      db,
      {
        migrationsFolder: history,
        ...(config.migrations?.table === undefined
          ? {}
          : { migrationsTable: config.migrations.table }),
      },
    ]);
    if (result !== undefined) throw new Error("Native migration failed");
  } finally {
    client.close();
  }
}

/** Delegates SQL server dialects to declared consumer tooling; the parent owns the entire group. */
export async function migrateServer(root: string, configPath: string): Promise<void> {
  const manifest = await consumerPath(root, "drizzle-kit/package.json");
  const executable = resolve(dirname(manifest), "bin.cjs");
  const child = Bun.spawn(
    [process.execPath, "--bun", executable, "migrate", "--config", configPath],
    {
      cwd: root,
      env: process.env,
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  if ((await child.exited) !== 0) throw new Error("Installed Drizzle migration failed");
}
