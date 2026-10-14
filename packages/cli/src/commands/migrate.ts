/** Runs the migration domain and emits one secret-free result under the existing CLI contract. */
import { Effect } from "effect";
import { cliValidation } from "../cli-errors.js";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "../main-support.js";
import { LayoutMigration } from "../migration/layout-migration.service.js";
import { layoutMigrationResult } from "../migration/layout-result.js";
import { reportMigrationFailure } from "./migrate-failure.js";
import type { MigrationResult } from "../migration/layout.types.js";

/**
 * Executes a normalized layout invocation; invalid flag combinations are usage failures.
 * @param args - Parser-normalized arguments.
 * @param context - Existing output and cancellation policy.
 * @returns Established success/failure status after the migration's cleanup.
 */
export const runMigrateEffect = Effect.fn("Cli.migrate")(
  function* (args: readonly string[], context: CliCommandContext) {
    const options = yield* cliValidation(() => migrationArguments(args));
    const migration = yield* LayoutMigration;
    if (options.rollback !== undefined) {
      const result = yield* migration.rollback(options.root, options.rollback);
      context.reporter.output(
        result,
        "Layout migration rolled back. Prepare fresh generated artifacts before development.",
      );
      return CLI_EXIT_CODES.success;
    }
    let result: MigrationResult;
    if (options.write) result = yield* migration.write(options.root);
    else result = layoutMigrationResult(yield* migration.preview(options.root), "preview");
    context.reporter.output(result, JSON.stringify(result, null, 2));
    return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
  },
  (effect, _args, context) =>
    effect.pipe(Effect.catchCause((cause) => reportMigrationFailure(cause, context))),
);

/**
 * Parses already-normalized flags and rejects conflicting mutation operations.
 * @param args - Literal normalized arguments.
 * @returns Explicit root and operation selection.
 * @throws CliFailureError For invalid syntax or --write with --rollback.
 */
function migrationArguments(args: readonly string[]) {
  if (args[0] !== "layout") throw fail("RELKIT_LAYOUT_USAGE", "Expected relkit migrate layout.", 2);
  let root = process.cwd(),
    rollback: string | undefined,
    write = false;
  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--write") write = true;
    else if (flag === "--project-root" || flag === "--rollback") {
      const value = args[++index];
      if (!value) throw fail("RELKIT_LAYOUT_USAGE", `Missing value for ${flag}.`, 2);
      if (flag === "--rollback") rollback = value;
      else root = value;
    } else throw fail("RELKIT_LAYOUT_USAGE", `Unknown option ${flag}.`, 2);
  }
  if (write && rollback !== undefined)
    throw fail("RELKIT_LAYOUT_USAGE", "--write and --rollback are mutually exclusive.", 2);
  return { root, rollback, write };
}
