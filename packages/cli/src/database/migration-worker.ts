/** Packaged finite native edge: user diagnostics stay captured, only a safe result is published. */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadMigrationConfig } from "./migration-config.js";
import { migrateServer, migrateSqlite, preflightHistory } from "./migration-execute.js";
import { MigrationFailure, type MigrationResponse } from "./migration.schemas.js";

async function execute(): Promise<MigrationResponse> {
  const root = process.cwd();
  const configPath = resolve(root, process.argv[2] ?? "drizzle.config.ts");
  const config = await loadMigrationConfig(root, configPath);
  const migrationPath = resolve(root, config.out);
  await preflightHistory(root, migrationPath);
  if (config.dialect === "sqlite") await migrateSqlite(root, config, migrationPath);
  else await migrateServer(root, configPath);
  return { ok: true, command: "db migrate", dialect: config.dialect, configPath, migrationPath };
}

if (import.meta.main) {
  const resultPath = process.argv[3];
  if (!resultPath) throw new Error("Missing owned migration result path");
  let result: MigrationResponse;
  try {
    result = await execute();
  } catch (error) {
    result =
      error instanceof MigrationFailure
        ? { ok: false, code: error.code, message: error.message, exitCode: error.exitCode }
        : {
            ok: false,
            code: "RELKIT_DB_MIGRATE_FAILED",
            message:
              "Migration failed. Inspect the selected configuration and SQL; statements were not retried and rollback is not guaranteed.",
            exitCode: 1,
          };
  }
  await writeFile(resultPath, JSON.stringify(result), { mode: 0o600 });
  process.exitCode = result.ok ? 0 : result.exitCode;
}
