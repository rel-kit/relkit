import { observeExecution } from "@relkit/contracts/operation";
import { Effect } from "effect";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GeneratorProcess, generatorProcessLayer } from "./generator-process.js";
import { domainError, domainTry, publicFailure } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { join } from "node:path";
import { CreateValidationError } from "./validate.js";
import {
  GenerateProjectError,
  type GenerateCommandResult,
  type GenerateFailurePoint,
  type GenerateProjectContext,
} from "./generate-types.js";
import type { StageCleanupResult } from "./generate-files.js";

/**
 * Maps a boundary failure to the public generation error contract.
 * @param error - Original public or internal failure.
 * @param fallback - Code used when the original failure has no public code.
 * @param cleanup - Optional staging path and cleanup outcome.
 * @returns The preserved or translated failure with optional staging disposition.
 */
export function generationError(
  error: unknown,
  fallback: string,
  cleanup?: StageCleanupResult,
): GenerateProjectError {
  error = publicFailure(error);
  let failure: GenerateProjectError;
  if (error instanceof GenerateProjectError) failure = error;
  else if (error instanceof CreateValidationError)
    failure = new GenerateProjectError(error.code, error.message);
  else if (error instanceof Error && "code" in error && typeof error.code === "string")
    failure = new GenerateProjectError(error.code, error.message, undefined, errorExitCode(error));
  else
    failure = new GenerateProjectError(
      fallback,
      error instanceof Error ? error.message : String(error),
    );

  if (cleanup?.temporaryPath === undefined) return failure;
  const state = cleanup.removed ? "cleaned" : "retained";
  return new GenerateProjectError(
    failure.code,
    `${failure.message} Temporary directory ${state}: ${cleanup.temporaryPath}.`,
    cleanup.temporaryPath,
    failure.exitCode,
  );
}

/**
 * Reads a supported exit code from an existing public failure.
 * @param error - Existing error whose exitCode field may be present.
 * @returns A supported explicit exit code, or undefined when absent or unsupported.
 */
function errorExitCode(error: Error): 1 | 2 | 130 | 143 | undefined {
  const value = "exitCode" in error ? error.exitCode : undefined;
  return value === 1 || value === 2 || value === 130 || value === 143 ? value : undefined;
}

/**
 * Runs deterministic failure injection for generation regression tests.
 * @param context - Caller-owned settings and cancellation.
 * @param point - Fixed deterministic generation failure-injection point.
 * @returns Completion when the hook succeeds; injected failures retain the generation error contract.
 */
export function injectGenerateFailure(
  context: GenerateProjectContext,
  point: GenerateFailurePoint,
): void {
  try {
    context.failAt?.(point);
  } catch (error) {
    if (error instanceof GenerateProjectError) throw error;
    throw new GenerateProjectError(
      `RELKIT_CREATE_${point.toUpperCase()}_FAILED`,
      error instanceof Error ? error.message : `Injected ${point} failure.`,
    );
  }
}

/**
 * Executes one generation step through scoped process authority.
 * @param context - Existing progress, failure injection and executable settings.
 * @param command - Literal command vector.
 * @param cwd - Staged project directory.
 * @param step - Fixed operation label used by the public failure code.
 * @param point - Fixed deterministic generation failure-injection point.
 * @returns Completion only after process output and exit have settled.
 */
export const runProjectStepEffect = Effect.fn("ProjectGeneration.step")(
  function* (
    context: GenerateProjectContext,
    command: readonly string[],
    cwd: string,
    step: string,
    point: GenerateFailurePoint,
  ) {
    yield* domainTry(() => {
      throwIfAborted(context.signal);
      injectGenerateFailure(context, point);
    });
    const result = yield* (yield* GeneratorProcess).run(command, cwd);
    yield* domainTry(() => throwIfAborted(context.signal));
    if (result.exitCode !== 0) {
      const output = result.stderr?.trim() || result.stdout?.trim();
      return yield* Effect.fail(
        domainError(
          new GenerateProjectError(
            `RELKIT_CREATE_${step.toUpperCase()}_FAILED`,
            `${step} failed with exit code ${result.exitCode}.${output ? `\n${output}` : ""}`,
          ),
        ),
      );
    }
  },
  (effect) => observeExecution("generator", "generation.step", effect),
);

/**
 * Preserves generation step's public Promise adapter.
 * @param context - Caller-owned settings and cancellation.
 * @param command - Literal executable and argument vector.
 * @param cwd - Working directory for the operation.
 * @param step - Fixed generated-project verification step.
 * @param point - Fixed deterministic generation failure-injection point.
 * @returns Completion after the existing contract has been applied.
 */
export function runProjectStep(
  context: GenerateProjectContext,
  command: readonly string[],
  cwd: string,
  step: string,
  point: GenerateFailurePoint,
): Promise<void> {
  const program = runProjectStepEffect(context, command, cwd, step, point);
  return runGeneratorPromise(
    context.commandRunner === undefined
      ? program
      : program.pipe(Effect.provide(generatorProcessLayer(context.commandRunner))),
    context.signal,
  );
}

/**
 * Throws the caller's existing cancellation reason before any new work is started.
 * @param signal - Optional caller cancellation signal.
 * @returns Completion after the existing contract has been applied.
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw (
      signal.reason ?? new GenerateProjectError("RELKIT_INTERRUPTED", "Generation was interrupted.")
    );
}

/**
 * Resolves the supported CLI using filesystem and process authority without importing it.
 * @param context - Caller-owned settings and cancellation.
 * @param root - Absolute project or owned resource root.
 * @returns The explicit, local or globally available relkit executable for project checks.
 */
export const resolveRelkitExecutableEffect = Effect.fn("ProjectGeneration.resolveCli")(
  function* (
    context: Pick<GenerateProjectContext, "relkitExecutable" | "commandRunner">,
    root: string,
  ) {
    if (context.relkitExecutable !== undefined) return context.relkitExecutable;
    if (context.commandRunner !== undefined) return "relkit";
    const fs = yield* GeneratorFileSystem;
    const global = yield* (yield* GeneratorProcess).which("relkit");
    for (const candidate of [join(root, "node_modules/.bin/relkit"), global]) {
      if (candidate === null) continue;
      const available = yield* fs.access(candidate).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      );
      if (available) return candidate;
    }
    return yield* Effect.fail(
      domainError(
        new GenerateProjectError(
          "RELKIT_CREATE_CLI_UNAVAILABLE",
          "The relkit CLI is not available for project checks.",
        ),
      ),
    );
  },
  (effect) => observeExecution("generator", "generation.resolveCli", effect),
);

/**
 * Preserves the CLI executable Promise API.
 * @param context - Caller-owned settings and cancellation.
 * @param root - Absolute project or owned resource root.
 * @returns The resolved CLI executable path after validating the supplied or available binary.
 */
export function resolveRelkitExecutable(
  context: GenerateProjectContext,
  root: string,
): Promise<string> {
  return runGeneratorPromise(resolveRelkitExecutableEffect(context, root));
}

/**
 * Runs a native child at the compatibility edge, with interruption owned by its resource scope.
 * @param command - Executable and literal arguments.
 * @param cwd - Working directory.
 * @param signal - Optional caller cancellation.
 * @returns Output and exit status after the child has been awaited.
 */
export function runProjectCommand(
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<GenerateCommandResult> {
  return runGeneratorPromise(
    GeneratorProcess.use((process) => process.run(command, cwd)),
    signal,
  );
}
