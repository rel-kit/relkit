/**
 * Normalizes a successful descriptor evaluation, checks graph-selected native
 * services and publishes one diagnostic/artifact cohort. Registry writes retain
 * their existing ordering; typed adapter failures remain owned by checkProject.
 */
import { canonicalJson } from "@relkit/contracts";
import {
  checkConventions,
  extractDescriptors,
  normalizeCompilation,
  type GeneratedOutputs,
} from "@relkit/compiler";
import { sortDiagnostics } from "@relkit/diagnostics";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { CliCompiler } from "../services/compiler.service.js";
import {
  checkSelectedRequirements,
  sourceIntegrationCandidates,
  sourceIntegrationImports,
} from "./check-dependencies.js";
import { checkSelectedServiceRequirements } from "./check-service-dependencies.js";
import { writeContextRegistryEffect } from "./check-context-registry.js";
import { writeEventRegistryEffect } from "./check-event-registry.js";
import { packageApplicationIdEffect } from "./check-input.js";
import { emitCheckResultEffect } from "./check-result.js";
import { conventionDescriptor } from "./check-support.js";
import type { evaluateCheckSources } from "./check-evaluation.js";
import type { CheckOptions } from "./check.types.js";

/**
 * Produces normalized graph outputs after declaration registries and typechecks.
 * @param projectRoot - Application and package resolution root.
 * @param input - The same evaluated generation and source facts.
 * @param options - Compilation mode selected by the caller.
 * @returns Normalized outputs, descriptor provenance and type diagnostics.
 */
const normalizeCheckEvaluation = Effect.fn("Project.checkNormalization")(function* (
  projectRoot: string,
  input: Effect.Success<ReturnType<typeof evaluateCheckSources>>,
  options: CheckOptions,
) {
  const compiler = yield* CliCompiler;
  const { evaluator, config, discoverySources, declaredIntegrations } = input;
  const extracted = yield* cliTry("project.extract", () =>
    extractDescriptors(evaluator, { projectRoot, sources: discoverySources }),
  );
  yield* Effect.all(
    [
      writeEventRegistryEffect(extracted, projectRoot, config.generatedDirectory),
      writeContextRegistryEffect(extracted, projectRoot, config.generatedDirectory),
    ],
    { concurrency: 2 },
  );
  const typeDiagnostics = yield* compiler.typecheck(projectRoot, config.generatedDirectory);
  const hasAgents = extracted.some((entry) => entry.descriptor.kind === "agent");
  const runtimeIntegrationPackages =
    hasAgents && !declaredIntegrations.some((entry) => entry.integrationId === "langchain")
      ? yield* cliTry("project.dependencyImports", () =>
          sourceIntegrationImports(
            projectRoot,
            sourceIntegrationCandidates(
              projectRoot,
              discoverySources,
              options.configPath,
              config.exclude,
            ),
            options.configPath,
            true,
          ),
        ).pipe(Effect.flatMap((options) => compiler.integrationPackages(options)))
      : declaredIntegrations;
  const appId = yield* packageApplicationIdEffect(projectRoot);
  const normalization = yield* cliTry("project.normalize", () =>
    normalizeCompilation({
      evaluator,
      projectRoot,
      sources: discoverySources,
      appId,
      mode: options.mode ?? "development",
      runtimeIntegrationPackages,
    }),
  );
  return { normalization, extracted, typeDiagnostics };
});

/**
 * Validates selected graph requirements before publishing the generated cohort.
 * @param projectRoot - Application root retained in diagnostic source paths.
 * @param input - Successful generation inputs and output directory.
 * @param options - Existing compilation policy.
 * @returns Content-aware generated artifact results and sorted diagnostics.
 */
export const finishCheckEvaluation = Effect.fn("Project.finishCheck")(function* (
  projectRoot: string,
  input: Effect.Success<ReturnType<typeof evaluateCheckSources>>,
  options: CheckOptions,
) {
  const { normalization, extracted, typeDiagnostics } = yield* normalizeCheckEvaluation(
    projectRoot,
    input,
    options,
  );
  const diagnostics = sortDiagnostics([
    ...typeDiagnostics,
    ...normalization.diagnostics,
    ...extracted.flatMap((entry) =>
      checkConventions({
        descriptor: conventionDescriptor(entry.descriptor.kind, entry.descriptor.id),
        sourcePath: entry.reference.module,
        projectRoot,
        location: entry.source,
        exportKind: entry.exportKind,
      }),
    ),
  ]);
  yield* checkSelectedRequirements(projectRoot, normalization.outputs.runtimeIntegrations);
  yield* checkSelectedServiceRequirements(projectRoot, normalization.outputs.graph);
  const outputs = {
    ...normalization.outputs,
    diagnostics: `${canonicalJson(diagnostics)}\n`,
    manifest: normalization.activatable ? normalization.outputs.manifest : "",
  } satisfies GeneratedOutputs;
  return yield* emitCheckResultEffect(
    projectRoot,
    input.outputDirectory,
    diagnostics,
    outputs,
    normalization.graphHash,
    input.config,
  );
});
