import { Cause, Effect, Layer } from "effect";
import { formatDiagnostics } from "@relkit/diagnostics";
import { parseProjectArgs } from "./commands/project-args.js";
import { runDevCommandEffect } from "./commands/dev-command.js";
import { runDeployEffect } from "./commands/deploy.js";
import { runDoctorEffect } from "./commands/doctor.js";
import { runEnvEffect } from "./commands/env.js";
import { runGraphEffect } from "./commands/graph.js";
import { runLocalEffect } from "./commands/local.js";
import { runStartEffect } from "./commands/start.js";
import { runClientEffect } from "./commands/client.js";
import { runJobsEffect } from "./commands/jobs.js";
import { CliProject, projectLiveLayer } from "./services/project.service.js";
import { clientLiveLayer } from "./services/client.service.js";
import { deploymentLiveLayer } from "./services/deployment.service.js";
import { doctorLiveLayer } from "./commands/doctor-project.service.js";
import { startLiveLayer } from "./commands/start.service.js";
import { localLiveLayer } from "./services/local.service.js";
import { devLiveLayer } from "./services/dev.service.js";
import { jobsLiveLayer } from "./services/jobs.service.js";
import { environmentProjectLayer } from "./commands/env-project.service.js";
import { graphFilesLayer } from "./commands/graph-file.service.js";
import { cliOriginalError, cliValidation } from "./cli-errors.js";
import { observeCli, runCliEffect } from "./cli-runtime.js";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "./main-support.js";
import type { CliInvocation } from "./cli-effect-runtime.js";
import type { CheckResult } from "./commands/check.js";
import type { BuildResult } from "./commands/build.js";

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
  return observeCli("invocation.dispatch", selectCommandEffect(invocation, context));
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
      return Effect.gen(function* () {
        const options = yield* cliValidation(() => parseProjectArgs(args, "start"));
        return yield* runStartEffect({
          ...optionalProjectRoot(options.projectRoot),
          ...(options.port === undefined ? {} : { port: options.port }),
          signal: context.signal,
        });
      }).pipe(Effect.provide(startLiveLayer()));
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
    default:
      return Effect.fail(
        fail("RELKIT_COMMAND_UNAVAILABLE", `Command is not implemented: ${invocation.command}`),
      );
  }
}

/**
 * Composes project checking/building and stable diagnostic formatting.
 * @param invocation - Selected check or build invocation.
 * @param context - Result presentation and cancellation.
 * @returns Lazy diagnostic-dependent status requiring CliProject.
 */
const executeProjectEffect = Effect.fn("Cli.project-command")(function* (
  invocation: CliInvocation,
  context: CliCommandContext,
) {
  const options = yield* cliValidation(() => parseProjectArgs(invocation.args, invocation.command));
  const project = yield* CliProject;
  if (invocation.command === "check") {
    const result = yield* project.check({
      ...optionalProjectRoot(options.projectRoot),
      signal: context.signal,
    });
    context.reporter.output(result, formatCheckResult(result));
    return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
  }
  const result = yield* project.build({
    ...optionalProjectRoot(options.projectRoot),
    signal: context.signal,
  });
  context.reporter.output(result, formatBuildResult(result));
  return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
});

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

/**
 * Formats stable project-check diagnostics.
 * @param result - Complete check result.
 * @returns Existing human output.
 */
function formatCheckResult(result: CheckResult): string {
  return result.ok
    ? `Checked ${result.projectRoot}`
    : formatDiagnostics(result.diagnostics) || "Application check failed.";
}

/**
 * Formats stable build diagnostics.
 * @param result - Complete build result.
 * @returns Existing human output.
 */
function formatBuildResult(result: BuildResult): string {
  return result.ok
    ? `Built ${result.buildDirectory}`
    : formatDiagnostics(result.diagnostics) || "Application build failed.";
}

/**
 * Preserves absent project-root defaults for the selected domain.
 * @param projectRoot - Optional explicit root.
 * @returns The existing optional argument shape.
 */
function optionalProjectRoot(
  projectRoot: string | undefined,
): { readonly projectRoot?: never } | { readonly projectRoot: string } {
  return projectRoot === undefined ? {} : { projectRoot };
}
