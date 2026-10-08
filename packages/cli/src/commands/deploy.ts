import { resolve } from "node:path";
import { Effect, Ref } from "effect";
import { cliOriginalError } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CLI_EXIT_CODES } from "../main-support.js";
import { CliDeployment, deploymentLiveLayer } from "../services/deployment.service.js";
import {
  DeployCommandError,
  interrupted,
  parseDeployArgs,
  safeErrorMessage,
} from "./deploy-support.js";
import type { DeployCommandOptions, DeployContext } from "./deploy-support.types.js";
export { DeployCommandError, parseDeployArgs } from "./deploy-support.js";
export type {
  DeployCommandOptions,
  DeployContext,
  DeployOperation,
  ParsedDeployArgs,
} from "./deploy-support.types.js";

/**
 * Runs one parsed deployment through its supplied domain service and existing reporter.
 * @param args - Arguments after deploy.
 * @param context - Existing output/event policy.
 * @param options - Project-root compatibility default; SDK substitutes belong to the Layer.
 * @returns The established exit status; defects and interruption remain distinct causes.
 */
export const runDeployEffect = Effect.fn("Cli.runDeploy")(
  function* (args: readonly string[], context: DeployContext, options: DeployCommandOptions = {}) {
    const redactions = yield* Ref.make<readonly string[]>([]);
    return yield* Effect.gen(function* () {
      const parsed = yield* Effect.try({
        try: () => parseDeployArgs(args),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((cause) =>
          cause instanceof DeployCommandError ? Effect.fail(cause) : Effect.die(cause),
        ),
      );
      yield* Ref.set(
        redactions,
        Object.values(parsed.config).map((entry) => entry.value),
      );
      const deployment = yield* CliDeployment;
      const root = resolve(parsed.projectRoot ?? options.projectRoot ?? process.cwd());
      const result = yield* deployment.run(root, parsed, context);
      yield* Effect.sync(() => context.reporter.output(result.value, result.human));
      return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
    }).pipe(
      Effect.catchTags({
        DeployCommandError: (error) => reportFailure(error, context, Ref.getUnsafe(redactions)),
        CliAdapterError: (error) =>
          reportFailure(cliOriginalError(error), context, Ref.getUnsafe(redactions)),
      }),
    );
  },
  (
    effect,
    _args: readonly string[],
    _context: DeployContext,
    _options: DeployCommandOptions = {},
  ) => observeCli("command.deploy", effect),
);

/**
 * Retains the public Promise edge with one invocation graph and cancellation scope.
 * @param args - Deployment arguments.
 * @param context - Existing presentation and signal policy.
 * @param options - Authorized native adapter substitutes.
 * @returns The command exit status after native calls and cleanup settle.
 */
export async function runDeploy(
  args: readonly string[],
  context: DeployContext,
  options: DeployCommandOptions = {},
): Promise<number> {
  try {
    return await runCliEffect(
      runDeployEffect(args, context, options),
      deploymentLiveLayer(options),
      context.signal,
    );
  } catch (cause) {
    if (!context.signal?.aborted) throw cause;
    const failure = interrupted(context.signal);
    context.reporter.error(failure.code, failure.message);
    return failure.exitCode;
  }
}

/** Reports a deployment failure with private invocation values redacted.
 * @param error - Expected native/domain failure.
 * @param context - Existing reporter.
 * @param redactions - Private invocation values.
 * @returns A lazy redacted diagnostic and established exit status.
 */
function reportFailure(error: unknown, context: DeployContext, redactions: readonly string[]) {
  return Effect.sync(() => {
    const code = commandCode(error);
    context.reporter.error(code, safeErrorMessage(error, redactions));
    return code === "RELKIT_DEPLOY_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
  });
}

/** Selects the established public deployment failure code.
 * @param error - Original native/domain failure.
 * @returns Its stable public code or the existing deployment fallback.
 */
function commandCode(error: unknown): string {
  return error instanceof DeployCommandError
    ? error.code
    : typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
      ? error.code
      : "RELKIT_DEPLOY_FAILED";
}
