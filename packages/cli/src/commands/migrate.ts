/**
 * Runs `relkit migrate` (the 0.9 code migration) and `relkit migrate layout` and emits one
 * secret-free result under the existing CLI contract. Both preview by default, apply with
 * `--write` and undo with `--rollback <record>`.
 */
import { Effect } from "effect";
import { cliValidation } from "../cli-errors.js";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "../main-support.js";
import { LayoutMigration } from "../migration/layout-migration.service.js";
import { layoutMigrationResult } from "../migration/layout-result.js";
import { CodeMigration } from "../migration/code-migration.service.js";
import { renderCodeMigration } from "../migration/code-result.js";
import { reportMigrationFailure } from "./migrate-failure.js";
import type { MigrationResult } from "../migration/layout.types.js";
import type { CodeMigrationResult } from "../migration/code-migration.types.js";

/**
 * Executes a normalized migrate invocation; invalid flag combinations are usage failures.
 * @param args - Parser-normalized arguments; `layout` first selects the layout migration.
 * @param context - Existing output and cancellation policy.
 * @returns Established success/failure status after the migration's cleanup.
 */
export const runMigrateEffect = Effect.fn("Cli.migrate")(
  function* (args: readonly string[], context: CliCommandContext) {
    if (args[0] !== "layout") return yield* runCodeMigration(args, context);
    const options = yield* cliValidation(() =>
      migrationArguments(args.slice(1), "RELKIT_LAYOUT_USAGE"),
    );
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
 * Previews, writes or rolls back the 0.9 code migration.
 * @param args - Normalized flags without a subcommand.
 * @param context - Output policy.
 * @returns Success, including when findings remain for the developer to change by hand.
 */
const runCodeMigration = Effect.fn("Cli.migrate.code")(function* (
  args: readonly string[],
  context: CliCommandContext,
) {
  const options = yield* cliValidation(() => migrationArguments(args, "RELKIT_MIGRATE_USAGE"));
  const migration = yield* CodeMigration;
  const settings = options.contract === undefined ? {} : { contract: options.contract };
  let result: CodeMigrationResult;
  if (options.rollback !== undefined)
    result = yield* migration.rollback(options.root, options.rollback);
  else if (options.write) result = yield* migration.write(options.root, settings);
  else result = yield* migration.preview(options.root, settings);
  context.reporter.output(result, renderCodeMigration(result));
  return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
});

/**
 * Parses already-normalized flags and rejects conflicting mutation operations.
 * @param args - Literal normalized flags.
 * @param usage - Usage error code for this command.
 * @returns Explicit root and operation selection.
 * @throws CliFailureError For invalid syntax or --write with --rollback.
 */
function migrationArguments(args: readonly string[], usage: string) {
  let root = process.cwd(),
    rollback: string | undefined,
    contract: string | undefined,
    write = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--write") write = true;
    else if (
      flag === "--project-root" ||
      flag === "--rollback" ||
      (flag === "--contract" && usage === "RELKIT_MIGRATE_USAGE")
    ) {
      const value = args[++index];
      if (!value) throw fail(usage, `Missing value for ${flag}.`, 2);
      if (flag === "--rollback") rollback = value;
      else if (flag === "--contract") contract = value;
      else root = value;
    } else throw fail(usage, `Unknown option ${flag}.`, 2);
  }
  if (write && rollback !== undefined)
    throw fail(usage, "--write and --rollback are mutually exclusive.", 2);
  return { root, rollback, contract, write };
}
