/** Runs check/build through the existing project service and stable diagnostic presentation. */
import { Effect } from "effect";
import { formatDiagnosticsEffect } from "@relkit/diagnostics";
import { parseProjectArgs } from "./commands/project-args.js";
import { CliProject } from "./services/project.service.js";
import { cliValidation } from "./cli-errors.js";
import { CLI_EXIT_CODES, type CliCommandContext } from "./main-support.js";
import type { CliInvocation } from "./cli-effect-runtime.js";
import type { CheckResult } from "./commands/check.js";
import type { BuildResult } from "./commands/build.js";
import { optionalProjectRoot } from "./command-start.js";
/**
 * Composes project checking/building and stable diagnostic formatting.
 * @param invocation - Selected check or build invocation.
 * @param context - Result presentation and cancellation.
 * @returns Lazy diagnostic-dependent status requiring CliProject.
 */
export const executeProjectEffect = Effect.fn("Cli.project-command")(function* (
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
    let human: string | undefined;
    if (!context.json) human = yield* formatCheckResult(result);
    context.reporter.output(result, human);
    return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
  }
  const result = yield* project.build({
    ...optionalProjectRoot(options.projectRoot),
    signal: context.signal,
  });
  let human: string | undefined;
  if (!context.json) human = yield* formatBuildResult(result);
  context.reporter.output(result, human);
  return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
});

/**
 * Formats stable project-check diagnostics.
 * @param result - Complete check result.
 * @returns Lazy human output with the checked project's actual source authority.
 */
function formatCheckResult(result: CheckResult) {
  if (result.ok) return Effect.succeed(`Checked ${result.projectRoot}`);
  return formatDiagnosticsEffect(result.diagnostics, { projectRoot: result.projectRoot }).pipe(
    Effect.map((text) => text || "Application check failed."),
  );
}

/**
 * Formats stable build diagnostics.
 * @param result - Complete build result.
 * @returns Lazy human output with the build's checked project source authority.
 */
function formatBuildResult(result: BuildResult) {
  if (result.ok) return Effect.succeed(`Built ${result.buildDirectory}`);
  return formatDiagnosticsEffect(result.diagnostics, { projectRoot: result.projectRoot }).pipe(
    Effect.map((text) => text || "Application build failed."),
  );
}
