/** Selects lazy command domains and supplies only their invocation-owned capabilities. */
import { Cause, Effect, Layer } from "effect";
import { runMigrateEffect } from "./commands/migrate.js";
import { runDbEffect } from "./commands/db.js";
import { processLayer } from "./services/process.service.js";
import { fileSystemLayer } from "./services/filesystem.service.js";
import { layoutMigrationLayer } from "./migration/layout-migration.service.js";
import { executeProjectEffect } from "./command-project.js";
import { executeStartEffect } from "./command-start.js";
import { runDevCommandEffect } from "./commands/dev-command.js";
import { runDeployEffect } from "./commands/deploy.js";
import { runDoctorEffect } from "./commands/doctor.js";
import { runEnvEffect } from "./commands/env.js";
import { runGraphEffect } from "./commands/graph.js";
import { runLocalEffect } from "./commands/local.js";
import { runClientEffect } from "./commands/client.js";
import { runJobsEffect } from "./commands/jobs.js";
import { projectLiveLayer } from "./services/project.service.js";
import { clientLiveLayer } from "./services/client.service.js";
import { deploymentLiveLayer } from "./services/deployment.service.js";
import { doctorLiveLayer } from "./commands/doctor-project.service.js";
import { startLiveLayer } from "./commands/start.service.js";
import { localLiveLayer } from "./services/local.service.js";
import { devLiveLayer } from "./services/dev.service.js";
import { jobsLiveLayer } from "./services/jobs.service.js";
import { environmentProjectLayer } from "./commands/env-project.service.js";
import { graphFilesLayer } from "./commands/graph-file.service.js";
import { cliOriginalError } from "./cli-errors.js";
import { observeCli, runCliEffect } from "./cli-runtime.js";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "./main-support.js";
import type { CliInvocation } from "./cli-effect-runtime.js";

/**
 * Executes the established public Promise dispatch boundary.
 * @param invocation - Parsed command and original arguments.
 * @param context - Existing presentation and cancellation policy.
 * @returns Established exit status after the selected domain's cleanup.
 */
export function executeCommand(
  invocation: CliInvocation,
  context: CliCommandContext,
): Promise<number> {
  return runCliEffect(executeCommandEffect(invocation, context), Layer.empty, context.signal, {
    json: context.json,
    io: context.io ?? {
      stdout: (line) => process.stdout.write(`${line}\n`),
      stderr: (line) => process.stderr.write(`${line}\n`),
    },
  });
}

/**
 * Provides exactly the selected domain inside the caller's invocation scope.
 * @param invocation - Parsed command and original arguments.
 * @param context - Existing presentation and cancellation policy.
 * @returns Lazy command exit status; help never acquires project/runtime domains.
 */
export function executeCommandEffect(
  invocation: CliInvocation,
  context: CliCommandContext,
): Effect.Effect<
  number,
  Effect.Error<ReturnType<typeof selectCommandEffect>>,
  Effect.Services<ReturnType<typeof selectCommandEffect>>
> {
  const selected: Effect.Effect<
    number,
    Effect.Error<ReturnType<typeof selectCommandEffect>>,
    Effect.Services<ReturnType<typeof selectCommandEffect>>
  > = selectCommandEffect(invocation, context);
  return observeCli("invocation.dispatch", selected);
}

/**
 * Selects one lazy domain, retaining each branch's concrete typed failures and services.
 * @param invocation - Parsed command and original arguments.
 * @param context - Existing presentation and cancellation policy.
 * @returns The selected branch; the public wrapper combines its covariant error/service unions.
 */
function selectCommandEffect(invocation: CliInvocation, context: CliCommandContext) {
  const args = invocation.args;
  switch (invocation.command) {
    case "check":
    case "build":
      return executeProjectEffect(invocation, context).pipe(Effect.provide(projectLiveLayer));
    case "doctor":
      return runDoctorEffect(args, context).pipe(Effect.provide(doctorLiveLayer()));
    case "dev":
      return runDevCommandEffect(args, context).pipe(
        Effect.provide(devLiveLayer()),
        Effect.as(CLI_EXIT_CODES.success),
      );
    case "start":
      return executeStartEffect(args, context).pipe(Effect.provide(startLiveLayer()));
    case "graph":
      return reportReadFailure(
        runGraphEffect(args, context).pipe(Effect.provide(graphFilesLayer)),
        context,
        "RELKIT_GRAPH_FAILED",
        "RELKIT_GRAPH_USAGE",
      );
    case "env":
      return reportReadFailure(
        runEnvEffect(args, context).pipe(Effect.provide(environmentProjectLayer)),
        context,
        "RELKIT_ENV_FAILED",
        "RELKIT_ENV_USAGE",
      );
    case "local":
      return runLocalEffect(args, context).pipe(Effect.provide(localLiveLayer()));
    case "deploy":
      return runDeployEffect(args, context).pipe(Effect.provide(deploymentLiveLayer()));
    case "client":
      return runClientEffect(args, context).pipe(Effect.provide(clientLiveLayer));
    case "jobs":
      return runJobsEffect(args, context).pipe(Effect.provide(jobsLiveLayer()));
    case "migrate":
      return runMigrateEffect(args, context).pipe(Effect.provide(layoutMigrationLayer));
    case "db":
      return runDbEffect(args, context).pipe(
        Effect.provide(Layer.merge(processLayer, fileSystemLayer)),
      );
    default:
      return Effect.fail(
        fail("RELKIT_COMMAND_UNAVAILABLE", `Command is not implemented: ${invocation.command}`),
      );
  }
}

/**
 * Retains each read command's existing terminal error presentation policy.
 * @typeParam E - Typed domain failure.
 * @typeParam R - Explicit domain requirements.
 * @param effect - Native read command.
 * @param context - Existing reporter.
 * @param fallback - Existing unknown-error code.
 * @param usage - Existing usage-error code.
 * @returns Lazy reported status; defects are handled only at this terminal policy.
 */
function reportReadFailure<E, R>(
  effect: Effect.Effect<number, E, R>,
  context: CliCommandContext,
  fallback: string,
  usage: string,
) {
  return effect.pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : Effect.sync(() => {
            const error = cliOriginalError(Cause.squash(cause));
            const code = error instanceof Error && "code" in error ? String(error.code) : fallback;
            context.reporter.error(code, error instanceof Error ? error.message : String(error));
            return code === usage ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
          }),
    ),
  );
}
