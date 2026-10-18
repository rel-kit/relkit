/** Internal worker/result boundary; connection values never cross back to the CLI. */
import { Schema } from "effect";

export const MigrationSuccess = Schema.Struct({
  ok: Schema.Literal(true),
  command: Schema.Literal("db migrate"),
  dialect: Schema.Literals(["sqlite", "postgresql", "mysql"]),
  configPath: Schema.String,
  migrationPath: Schema.String,
});
export const MigrationError = Schema.Struct({
  ok: Schema.Literal(false),
  code: Schema.Literals([
    "RELKIT_DB_CONFIG",
    "RELKIT_DB_DEPENDENCY",
    "RELKIT_DB_HISTORY",
    "RELKIT_DB_MIGRATE_FAILED",
  ]),
  message: Schema.String,
  exitCode: Schema.Literals([1, 2]),
});
export const MigrationResponse = Schema.Union([MigrationSuccess, MigrationError]);
export type MigrationResponse = typeof MigrationResponse.Type;

/** Expected private failures contain only tool-authored, secret-free diagnostics. */
export class MigrationFailure extends Schema.TaggedError<MigrationFailure>()("MigrationFailure", {
  code: MigrationError.fields.code,
  message: Schema.String,
  exitCode: MigrationError.fields.exitCode,
}) {}

export const MigrationConfig = Schema.Struct({
  dialect: Schema.Literals(["sqlite", "postgresql", "mysql"]),
  out: Schema.String,
  dbCredentials: Schema.Record(Schema.String, Schema.Unknown),
  migrations: Schema.optionalKey(
    Schema.Struct({
      table: Schema.optionalKey(Schema.String),
      schema: Schema.optionalKey(Schema.String),
    }),
  ),
});
export type MigrationConfig = typeof MigrationConfig.Type;
