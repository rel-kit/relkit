/** Packaged finite native edge: user diagnostics stay captured, only a safe result is published. */
import { open, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
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

/** Accepts only the fixed result filename in a direct, non-symlink owned temporary directory. */
async function resultDirectory(path: string | undefined): Promise<string> {
  if (!path) throw new Error("Missing owned migration result path");
  const temporary = resolve(tmpdir());
  const candidate = resolve(path);
  if (!candidate.startsWith(temporary + sep)) throw new Error("Result must be temporary");
  const directory = dirname(candidate);
  if (
    dirname(directory) !== temporary ||
    !basename(directory).startsWith("relkit-db-migrate-") ||
    basename(candidate) !== "result.json"
  )
    throw new Error("Invalid owned migration result path");
  const canonicalTemporary = await realpath(temporary);
  const canonicalDirectory = await realpath(directory);
  if (
    !canonicalDirectory.startsWith(canonicalTemporary + sep) ||
    canonicalDirectory !== join(canonicalTemporary, basename(directory))
  )
    throw new Error("Result directory must not escape through a symlink");
  return canonicalDirectory;
}

if (import.meta.main) {
  const directory = await resultDirectory(process.argv[3]);
  const output = await open(join(directory, "result.json"), "wx", 0o600);
  try {
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
    await output.writeFile(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : result.exitCode;
  } finally {
    await output.close();
  }
}
