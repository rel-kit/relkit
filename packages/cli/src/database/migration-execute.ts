/** Native finite worker adapters: preflight history before opening the configured target. */
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerModule, consumerPath, usage } from "./migration-config.js";
import { MigrationFailure, type MigrationConfig } from "./migration.schemas.js";
import { runtime } from "../runtime/index.js";

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

/** Applies SQLite with the runtime's native driver and the consumer's matching migrator. */
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
  const modules = runtime.name === "bun" ? "drizzle-orm/bun-sqlite" : "drizzle-orm/node-sqlite";
  const driver = await consumerModule(root, modules);
  const migrator = await consumerModule(root, `${modules}/migrator`);
  if (typeof driver.drizzle !== "function" || typeof migrator.migrate !== "function")
    throw usage("The installed ORM must support this runtime's SQLite driver and migrator.");
  await mkdir(dirname(path), { recursive: true });
  // Each runtime's SQLite module only loads on that runtime.
  const sqlite =
    runtime.name === "bun"
      ? (await import("./bun/sqlite-client.js")).openBunSqlite(path)
      : (await import("./node/sqlite-client.js")).openNodeSqlite(path);
  try {
    sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    const db: unknown = Reflect.apply(driver.drizzle, undefined, [{ client: sqlite.client }]);
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
    sqlite.close();
  }
}

/** Delegates SQL server dialects to declared consumer tooling; the parent owns the entire group. */
export async function migrateServer(root: string, configPath: string): Promise<void> {
  const manifest = await consumerPath(root, "drizzle-kit/package.json");
  const executable = resolve(dirname(manifest), "bin.cjs");
  const command =
    runtime.name === "bun"
      ? [process.execPath, "--bun", executable, "migrate", "--config", configPath]
      : [process.execPath, executable, "migrate", "--config", configPath];
  const child = runtime.processes.spawn(command, {
    cwd: root,
    env: process.env,
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await child.exited) !== 0) throw new Error("Installed Drizzle migration failed");
}
