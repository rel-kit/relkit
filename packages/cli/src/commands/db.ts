/** Runs finite database tooling inside the existing scoped filesystem/process capabilities. */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Cause, Effect, Schema } from "effect";
import { cliValidation } from "../cli-errors.js";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "../main-support.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliProcess } from "../services/process.service.js";
import { MigrationResponse } from "../database/migration.schemas.js";

/** Captures configuration/tool output and publishes only after worker and temporary cleanup settle. */
export const runDbEffect = Effect.fn("Cli.db.migrate")(
  function* (args: readonly string[], context: CliCommandContext) {
    const config = yield* cliValidation(() => {
      if (
        args[0] !== "migrate" ||
        (args.length !== 1 && (args.length !== 3 || args[1] !== "--config" || !args[2]))
      )
        throw fail("RELKIT_DB_CONFIG", "Expected relkit db migrate [--config <path>].", 2);
      return args[2] ?? "drizzle.config.ts";
    });
    const result = yield* Effect.scoped(
      Effect.gen(function* () {
        const files = yield* CliFileSystem;
        const processes = yield* CliProcess;
        const temporary = yield* Effect.acquireRelease(
          files.stage(join(tmpdir(), "relkit-db-migrate-")),
          (path) => files.remove(path).pipe(Effect.orDie),
        );
        const resultPath = join(temporary, "result.json");
        const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
        const worker = fileURLToPath(
          new URL(`../database/migration-worker.${extension}`, import.meta.url),
        );
        const child = yield* processes.run({
          command: process.execPath,
          args: [worker, config, resultPath],
          cwd: context.cwd ?? process.cwd(),
          maximumOutputBytes: 64 * 1024,
        });
        const response = yield* files
          .readText(resultPath)
          .pipe(
            Effect.flatMap((text) =>
              Schema.decodeUnknownEffect(MigrationResponse)(JSON.parse(text)),
            ),
          );
        if (child.exitCode !== (response.ok ? 0 : response.exitCode))
          return yield* Effect.fail(
            fail("RELKIT_DB_MIGRATE_FAILED", "Migration worker did not complete successfully."),
          );
        return response;
      }),
    );
    if (!result.ok) {
      context.reporter.error(result.code, result.message);
      return result.exitCode;
    }
    context.reporter.output(result, "Database migrations applied.");
    return CLI_EXIT_CODES.success;
  },
  (effect, _args, context) =>
    effect.pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        return Effect.sync(() => {
          context.reporter.error(
            "RELKIT_DB_MIGRATE_FAILED",
            "Migration worker failed. Check configuration, installed tooling and SQL; no automatic retry or rollback was performed.",
          );
          return CLI_EXIT_CODES.failure;
        });
      }),
    ),
);
