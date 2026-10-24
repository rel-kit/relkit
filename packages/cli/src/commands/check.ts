/**
 * Compiles one project generation through preflight, evaluation and normalization.
 * Expected adapter failures become deterministic diagnostics; interruption and
 * defects retain the caller's scope and the public Promise boundary joins cleanup.
 */
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { cliOriginalError } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCompiler } from "../services/compiler.service.js";
import { projectCapabilitiesLayer } from "../services/project-capabilities.js";
import { evaluateCheckSources } from "./check-evaluation.js";
import { finishCheckEvaluation } from "./check-normalization.js";
import { emitCheckResultEffect } from "./check-result.js";
import { checkFailureDiagnosticsEffect, evaluatorDiagnostics } from "./check-support.js";
import type { CheckOptions } from "./check.types.js";
export type { CheckOptions } from "./check.types.js";
export type { CheckResult } from "./check-result.types.js";

/**
 * Compiles a project using the caller's compiler, filesystem, and module capabilities.
 * @param options - Project inputs and evaluator policy; no runtime executes during construction.
 * @returns A lazy compilation outcome. Expected adapter failures become diagnostics; interruption and defects escape.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { checkProjectEffect } from "./check.js";
 * import { projectCapabilitiesLayer } from "../services/project-capabilities.js";
 * const checked = await Effect.runPromise(checkProjectEffect({}).pipe(Effect.provide(projectCapabilitiesLayer)));
 * ```
 */
export const checkProjectEffect = Effect.fn("Project.check")(
  function* (options: CheckOptions = {}) {
    const projectRoot = resolve(options.projectRoot ?? process.cwd());
    const generatedDirectory = join(projectRoot, ".relkit", "generated");
    const generationId = options.generationId ?? `cli-check-${crypto.randomUUID()}`;
    const work = Effect.gen(function* () {
      const input = yield* evaluateCheckSources(projectRoot, options, generationId);
      if (input.evaluator.status === "ok")
        return yield* finishCheckEvaluation(projectRoot, input, options);
      const compiler = yield* CliCompiler;
      const typeDiagnostics = yield* compiler.typecheck(
        projectRoot,
        input.config.generatedDirectory,
      );
      return yield* emitCheckResultEffect(projectRoot, input.outputDirectory, [
        ...typeDiagnostics,
        ...evaluatorDiagnostics(input.evaluator.failures),
      ]);
    });
    return yield* work.pipe(
      Effect.catchTag("CliAdapterError", (error) =>
        Effect.gen(function* () {
          const diagnostics = yield* checkFailureDiagnosticsEffect(
            cliOriginalError(error),
            projectRoot,
            resolve(projectRoot, options.configPath ?? "relkit.config.ts"),
          );
          return yield* emitCheckResultEffect(projectRoot, generatedDirectory, diagnostics);
        }),
      ),
    );
  },
  (effect, _options: CheckOptions = {}) => observeCli("project.check", effect),
);

/**
 * Compiles one project at its established public Promise boundary.
 * @param options - Project inputs, policies, and caller cancellation.
 * @returns Deterministic diagnostic and content-aware artifact results after scoped cleanup.
 * @see {@link checkProjectEffect} for lazy composition.
 */
export function checkProject(options: CheckOptions = {}) {
  return runCliEffect(checkProjectEffect(options), projectCapabilitiesLayer, options.signal);
}
/** Legacy alias for the same public compilation boundary. */
export const runCheck = checkProject;
