import { Effect } from "effect";
import { cliOriginalError } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CLI_EXIT_CODES } from "../main-support.js";
import { CliLocal, localLiveLayer } from "../services/local.service.js";
import { LocalCommandError } from "./local-operation-support.js";
import { parseLocalArgs } from "./local-args.js";
import type { LocalCommandContext, LocalCommandDependencies } from "./local.types.js";
export type { LocalCommandDependencies } from "./local.types.js";

/**
 * Parses one selected local command and composes its domain service.
 * @param args - Arguments after local.
 * @param context - Existing reporting/interaction policy.
 * @param dependencies - Compatibility input retained; its callback belongs to the supplied Layer.
 * @returns Lazy established exit status, with no hidden native authority.
 */
export const runLocalEffect = Effect.fn("Cli.runLocal")(
  function* (
    args: readonly string[],
    context: LocalCommandContext,
    dependencies: LocalCommandDependencies = {},
  ) {
    return yield* Effect.gen(function* () {
      const parsed = yield* Effect.try({
        try: () => parseLocalArgs(args),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((cause) =>
          cause instanceof LocalCommandError ? Effect.fail(cause) : Effect.die(cause),
        ),
      );
      const local = yield* CliLocal;
      return yield* local.run(parsed, context);
    }).pipe(
      Effect.catchTags({
        LocalCommandError: (error) => reportFailure(error, context),
        CliAdapterError: (error) => reportFailure(cliOriginalError(error), context),
      }),
    );
  },
  (
    effect,
    _args: readonly string[],
    _context: LocalCommandContext,
    _dependencies: LocalCommandDependencies = {},
  ) => observeCli("command.local", effect),
);

/**
 * Retains the public local command Promise edge with one invocation scope.
 * @param args - Selected local operation/options.
 * @param context - Reporter, interaction policy, and caller signal.
 * @param dependencies - Existing authorized confirmation substitute.
 * @returns The established exit status after scoped local cleanup.
 */
export function runLocal(
  args: readonly string[],
  context: LocalCommandContext,
  dependencies: LocalCommandDependencies = {},
): Promise<number> {
  return runCliEffect(
    runLocalEffect(args, context, dependencies),
    localLiveLayer(dependencies),
    context.signal,
  );
}

/** Reports an expected local-command failure using its established exit status.
 * @param error - Expected native/domain failure.
 * @param context - Existing reporter.
 * @returns Lazy public diagnostic and established usage/failure status.
 */
function reportFailure(error: unknown, context: LocalCommandContext) {
  return Effect.sync(() => {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "RELKIT_LOCAL_FAILED";
    context.reporter.error(code, error instanceof Error ? error.message : String(error));
    return code === "RELKIT_LOCAL_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
  });
}
