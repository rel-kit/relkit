/**
 * Reads one check generation and preflights selected imports before descriptor
 * evaluation. Compiler and filesystem capabilities remain in the caller's scope;
 * the result retains source provenance for normalization and diagnostics.
 */
import { join } from "node:path";
import { prefilterSources } from "../compiler/index.js";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { CliCompiler } from "../services/compiler.service.js";
import { preflightSourceImports } from "./check-dependencies.js";
import { discoverySourcesEffect, readConfigEffect, readSourcesEffect } from "./check-input.js";
import { writeRouteModuleChecksEffect } from "./check-route-modules.js";
import { bunOnlyImports, bunRuntimeDiagnostic } from "./check-runtime-imports.js";
import type { CheckOptions, CheckSource } from "./check.types.js";
import { runtime } from "../runtime/index.js";

/**
 * Collects the generation's source facts without evaluating application modules.
 * @param projectRoot - Actual consumer root.
 * @param options - Configuration and source discovery policy.
 * @param generationId - Isolated module generation identity.
 * @returns Accepted configuration, sources, preflighted package metadata and, on Node, the
 * imports of Bun-only modules that would stop evaluation.
 */
export const readCheckSources = Effect.fn("Project.checkSources")(function* (
  projectRoot: string,
  options: CheckOptions,
  generationId: string,
) {
  const compiler = yield* CliCompiler;
  const input = yield* readConfigEffect(projectRoot, options, generationId);
  const config = yield* compiler.loadConfig(input, projectRoot);
  const sources = yield* readSourcesEffect(projectRoot, config.source);
  yield* writeRouteModuleChecksEffect(
    sources.map((source) => source.fileName),
    projectRoot,
    config.generatedDirectory,
  );
  const discoverySources = yield* discoverySourcesEffect(projectRoot, options, sources);
  const prefiltered = yield* cliTry("project.prefilter", () =>
    prefilterSources(discoverySources, { projectRoot, exclude: config.exclude }),
  );
  const declaredIntegrations = yield* preflightSourceImports(
    projectRoot,
    discoverySources,
    options.configPath,
    config.exclude,
  );
  return {
    config,
    discoverySources,
    prefiltered,
    declaredIntegrations,
    runtimeImports: runtimeImportDiagnostics(discoverySources, prefiltered.skipped),
  };
});

/**
 * Reports imports of Bun-only modules when this CLI, and so its evaluator, runs on Node.
 * @param sources - Discovery sources.
 * @param skipped - Prefilter results; excluded files are never evaluated and are not scanned.
 * @returns One diagnostic per import, empty on Bun.
 */
function runtimeImportDiagnostics(
  sources: readonly CheckSource[],
  skipped: readonly { readonly fileName: string; readonly reason: string }[],
) {
  if (runtime.name === "bun") return [];
  const excluded = new Set(
    skipped.filter((entry) => entry.reason === "excluded").map((entry) => entry.fileName),
  );
  return bunOnlyImports(sources.filter((source) => !excluded.has(source.fileName))).map((finding) =>
    bunRuntimeDiagnostic(finding),
  );
}

/**
 * Evaluates only candidates whose safely known native dependencies passed preflight.
 * @param projectRoot - Consumer root and evaluator resolution authority.
 * @param options - Existing evaluator timeout, environment and network policy.
 * @param generationId - Generation used by configuration and descriptor imports.
 * @param input - Sources read by {@link readCheckSources} for this generation.
 * @returns Scoped evaluator outcome with the exact inputs needed by normalization.
 */
export const evaluateCheckSources = Effect.fn("Project.checkEvaluation")(function* (
  projectRoot: string,
  options: CheckOptions,
  generationId: string,
  input: Effect.Success<ReturnType<typeof readCheckSources>>,
) {
  const compiler = yield* CliCompiler;
  const outputDirectory = join(projectRoot, input.config.generatedDirectory);
  const evaluate = options.evaluate ?? compiler.evaluate;
  const evaluator = yield* evaluate({
    projectRoot,
    candidates: input.prefiltered.candidates,
    generationId,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.environmentAllowlist === undefined
      ? {}
      : { environmentAllowlist: options.environmentAllowlist }),
    ...(options.networkAllowlist === undefined
      ? {}
      : { networkAllowlist: options.networkAllowlist }),
    generatedDirectory: input.config.generatedDirectory,
    sourceMaps: true,
  });
  return {
    ...input,
    evaluator,
    outputDirectory,
  };
});
